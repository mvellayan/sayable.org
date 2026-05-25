// Derived from the gatsby scaffold (Development/gatsby); see NOTICE.md.
// Adapted for BetterVibe: multi-tenant relationships/threads, 16-table schema,
// application-enforced private/shared boundary (DynamoDB has no RLS).
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwv2Integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53targets from "aws-cdk-lib/aws-route53-targets";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import * as path from "path";

export interface BetterVibeStackProps extends cdk.StackProps {
  rootDomain: string;
  appDomain: string;
  otpSenderEmail: string;
  notificationSenderEmail: string;
  appBrand: string;
  ownerEmail: string;
}

export class BetterVibeStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BetterVibeStackProps) {
    super(scope, id, props);

    const {
      rootDomain,
      appDomain,
      otpSenderEmail,
      notificationSenderEmail,
      appBrand,
      ownerEmail,
    } = props;

    const tablePrefix = "BetterVibe";

    // ---------------- DynamoDB tables ----------------
    // 16-table schema. Privacy class (PRIVATE vs SHARED) is enforced in the
    // backend access layer, NOT by the database — DynamoDB has no RLS. See
    // backend/lib/access.ts (buildCoachContext / buildMediatorContext).
    const mkTable = (
      name: string,
      pk: string,
      sk?: string,
      ttl?: string
    ): dynamodb.Table => {
      return new dynamodb.Table(this, `${name}Table`, {
        tableName: `${tablePrefix}${name}`,
        partitionKey: { name: pk, type: dynamodb.AttributeType.STRING },
        ...(sk
          ? { sortKey: { name: sk, type: dynamodb.AttributeType.STRING } }
          : {}),
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        timeToLiveAttribute: ttl,
        pointInTimeRecoverySpecification: {
          pointInTimeRecoveryEnabled: true,
        },
      });
    };

    // --- Auth / identity ---
    // Users: PK userId. byEmail for OTP lookup, byStatus for admin listing.
    const usersTable = mkTable("Users", "userId");
    usersTable.addGlobalSecondaryIndex({
      indexName: "byEmail",
      partitionKey: { name: "emailLower", type: dynamodb.AttributeType.STRING },
    });
    usersTable.addGlobalSecondaryIndex({
      indexName: "byStatus",
      partitionKey: { name: "status", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
    });

    const otpTable = mkTable("OtpCodes", "emailLower", undefined, "expiresAt");
    const configTable = mkTable("Config", "key");

    // --- Core: SHARED (both partners may read; only sent data lands here) ---
    const relationshipsTable = mkTable("Relationships", "relationshipId");
    // RelationshipMembers: PK userId, SK relationshipId — "my relationships".
    const relationshipMembersTable = mkTable(
      "RelationshipMembers",
      "userId",
      "relationshipId"
    );
    // RelationshipInvites: PK inviteId. Single-use, expiring (TTL), bound to a
    // relationship. byRelationship lists outstanding invites. Asymmetric onboarding.
    const relationshipInvitesTable = mkTable(
      "RelationshipInvites",
      "inviteId",
      undefined,
      "expiresAt"
    );
    relationshipInvitesTable.addGlobalSecondaryIndex({
      indexName: "byRelationship",
      partitionKey: {
        name: "relationshipId",
        type: dynamodb.AttributeType.STRING,
      },
    });
    // Threads: PK relationshipId, SK threadId. Carries goal(§4), status(§7),
    // safetyState, lastActivityAt.
    const threadsTable = mkTable("Threads", "relationshipId", "threadId");
    // Messages: PK threadId, SK ts. SENT messages ONLY — the single
    // cross-user-readable store. bySender for per-user history.
    const messagesTable = mkTable("Messages", "threadId", "ts");
    messagesTable.addGlobalSecondaryIndex({
      indexName: "bySender",
      partitionKey: { name: "senderId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "ts", type: dynamodb.AttributeType.STRING },
    });
    // MediatorSummaries: PK threadId, SK ts. Shared Mediator output (§9).
    const mediatorSummariesTable = mkTable(
      "MediatorSummaries",
      "threadId",
      "ts"
    );
    // Patterns: PK relationshipId, SK patternId. SHARED relationship dynamics (§10).
    const patternsTable = mkTable("Patterns", "relationshipId", "patternId");

    // --- PRIVATE (owner-only; never returned to the partner or the mediator) ---
    const draftsTable = mkTable("Drafts", "userId", "threadId"); // §5
    const reviewsTable = mkTable("Reviews", "userId", "reviewId"); // §6 My Coach
    const observationsTable = mkTable("Observations", "userId", "observationId"); // §10
    const profilesTable = mkTable("Profiles", "userId"); // §1 communication profile

    // --- Ops ---
    const usageTable = mkTable("Usage", "userId", "period"); // §18 cost/usage
    const feedbackTable = mkTable("Feedback", "userId", "feedbackId"); // §20
    feedbackTable.addGlobalSecondaryIndex({
      indexName: "byRelationship",
      partitionKey: {
        name: "relationshipId",
        type: dynamodb.AttributeType.STRING,
      },
    });
    // SafetyEvents: PK relationshipId, SK ts. Incident log (§14; admin §19 reads).
    const safetyEventsTable = mkTable("SafetyEvents", "relationshipId", "ts");

    const allTables = [
      usersTable,
      otpTable,
      configTable,
      relationshipsTable,
      relationshipMembersTable,
      relationshipInvitesTable,
      threadsTable,
      messagesTable,
      mediatorSummariesTable,
      patternsTable,
      draftsTable,
      reviewsTable,
      observationsTable,
      profilesTable,
      usageTable,
      feedbackTable,
      safetyEventsTable,
    ];

    // ---------------- S3 frontend bucket ----------------
    const frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      bucketName: `bettervibe-frontend-${this.account}-${this.region}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // ---------------- Secrets ----------------
    const jwtSecret = new secrets.Secret(this, "JwtSecret", {
      secretName: "bettervibe/jwt-secret",
      generateSecretString: {
        passwordLength: 64,
        excludePunctuation: true,
      },
    });

    const anthropicSecret = new secrets.Secret(this, "AnthropicApiKey", {
      secretName: "bettervibe/anthropic-api-key",
      description:
        "Anthropic API key for BetterVibe. Populate via aws/create.sh on first deploy.",
      secretStringValue: cdk.SecretValue.unsafePlainText(
        "REPLACE_ME_VIA_CREATE_SH"
      ),
    });

    // ---------------- Hosted zone + cert ----------------
    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: rootDomain,
    });

    const certificate = new acm.Certificate(this, "AppCert", {
      domainName: appDomain,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // ---------------- Lambda env (shared) ----------------
    const sharedEnv: Record<string, string> = {
      TABLE_PREFIX: tablePrefix,
      USERS_TABLE: usersTable.tableName,
      OTP_TABLE: otpTable.tableName,
      CONFIG_TABLE: configTable.tableName,
      RELATIONSHIPS_TABLE: relationshipsTable.tableName,
      RELATIONSHIP_MEMBERS_TABLE: relationshipMembersTable.tableName,
      RELATIONSHIP_INVITES_TABLE: relationshipInvitesTable.tableName,
      THREADS_TABLE: threadsTable.tableName,
      MESSAGES_TABLE: messagesTable.tableName,
      MEDIATOR_SUMMARIES_TABLE: mediatorSummariesTable.tableName,
      PATTERNS_TABLE: patternsTable.tableName,
      DRAFTS_TABLE: draftsTable.tableName,
      REVIEWS_TABLE: reviewsTable.tableName,
      OBSERVATIONS_TABLE: observationsTable.tableName,
      PROFILES_TABLE: profilesTable.tableName,
      USAGE_TABLE: usageTable.tableName,
      FEEDBACK_TABLE: feedbackTable.tableName,
      SAFETY_EVENTS_TABLE: safetyEventsTable.tableName,
      JWT_SECRET_ARN: jwtSecret.secretArn,
      ANTHROPIC_SECRET_ARN: anthropicSecret.secretArn,
      OTP_SENDER_EMAIL: otpSenderEmail,
      NOTIFICATION_SENDER_EMAIL: notificationSenderEmail,
      APP_DOMAIN: appDomain,
      APP_URL: `https://${appDomain}`,
      APP_BRAND: appBrand,
      OWNER_EMAIL: ownerEmail,
      JWT_TTL_DAYS: "30",
      OTP_TTL_MINUTES: "10",
      INVITE_TTL_DAYS: "14",
      // §18 soft monthly cost threshold per user (USD). Tweak via Config table.
      COST_SOFT_THRESHOLD_USD: "10",
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: "1",
    };

    const backendCode = lambda.Code.fromAsset(
      path.resolve(__dirname, "..", "..", "backend"),
      {
        exclude: [
          "node_modules/aws-sdk/**",
          "*.md",
          ".env*",
          "tests/**",
          "test/**",
          "**/.DS_Store",
        ],
      }
    );

    const mkFn = (
      name: string,
      handler: string,
      timeoutSec = 15,
      memoryMb = 512
    ) => {
      const fn = new lambda.Function(this, `${name}Fn`, {
        functionName: `bettervibe-${name.toLowerCase()}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler,
        code: backendCode,
        timeout: cdk.Duration.seconds(timeoutSec),
        memorySize: memoryMb,
        environment: sharedEnv,
        logRetention: logs.RetentionDays.TWO_WEEKS,
      });
      jwtSecret.grantRead(fn);
      anthropicSecret.grantRead(fn);
      return fn;
    };

    // authFn: email-OTP signin, open signup, partner invite accept, /auth/me.
    const authFn = mkFn("Auth", "handlers/auth.handler", 10, 512);

    // apiFn: REST — relationships, threads, messages (list/poll/send), drafts,
    // profile, observations, patterns, feedback, admin, deletion. Owns the
    // send pipeline + safety gate.
    const apiFn = mkFn("Api", "handlers/api.handler", 30, 1024);

    // coachFn: private per-user streaming review (My Coach / Their Coach).
    // Lambda function URL with RESPONSE_STREAM so the drafting user receives
    // SSE deltas. Streams ONLY to the requesting user — never broadcast.
    const coachFn = new lambda.Function(this, "CoachFn", {
      functionName: "bettervibe-coach",
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handlers/coach.handler",
      code: backendCode,
      timeout: cdk.Duration.minutes(2),
      memorySize: 1769,
      environment: sharedEnv,
      logRetention: logs.RetentionDays.TWO_WEEKS,
    });
    jwtSecret.grantRead(coachFn);
    anthropicSecret.grantRead(coachFn);

    const coachFunctionUrl = coachFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
      cors: {
        allowedOrigins: [`https://${appDomain}`, "http://localhost:5173"],
        allowedMethods: [lambda.HttpMethod.POST],
        allowedHeaders: ["authorization", "content-type"],
        maxAge: cdk.Duration.days(1),
      },
    });

    // Grant DynamoDB access to all three functions.
    for (const t of allTables) {
      t.grantReadWriteData(authFn);
      t.grantReadWriteData(apiFn);
      t.grantReadWriteData(coachFn);
    }

    // SES — auth + notifications.
    const sesPolicy = new iam.PolicyStatement({
      actions: ["ses:SendEmail", "ses:SendRawEmail"],
      resources: ["*"],
    });
    authFn.addToRolePolicy(sesPolicy);
    apiFn.addToRolePolicy(sesPolicy);

    // ---------------- HTTP API Gateway (auth + REST) ----------------
    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "bettervibe-api",
      corsPreflight: {
        allowHeaders: ["authorization", "content-type"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: [`https://${appDomain}`, "http://localhost:5173"],
        maxAge: cdk.Duration.days(1),
      },
    });

    const authIntegration = new apigwv2Integrations.HttpLambdaIntegration(
      "AuthIntegration",
      authFn
    );
    const apiIntegration = new apigwv2Integrations.HttpLambdaIntegration(
      "ApiIntegration",
      apiFn
    );

    // Throttle the OTP + signup endpoints — they're the abuse surface.
    const requestOtpRoutes = httpApi.addRoutes({
      path: "/auth/request-otp",
      methods: [apigwv2.HttpMethod.POST],
      integration: authIntegration,
    });
    const signupRoutes = httpApi.addRoutes({
      path: "/auth/signup",
      methods: [apigwv2.HttpMethod.POST],
      integration: authIntegration,
    });
    httpApi.addRoutes({
      path: "/auth/{proxy+}",
      methods: [apigwv2.HttpMethod.ANY],
      integration: authIntegration,
    });
    httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [apigwv2.HttpMethod.ANY],
      integration: apiIntegration,
    });

    const stage = httpApi.defaultStage?.node.defaultChild as
      | apigwv2.CfnStage
      | undefined;
    if (stage) {
      stage.addPropertyOverride("DefaultRouteSettings", {
        ThrottlingBurstLimit: 20,
        ThrottlingRateLimit: 10,
      });
      stage.addPropertyOverride("RouteSettings", {
        "POST /auth/request-otp": {
          ThrottlingBurstLimit: 5,
          ThrottlingRateLimit: 1,
        },
        "POST /auth/signup": {
          ThrottlingBurstLimit: 5,
          ThrottlingRateLimit: 1,
        },
      });
      for (const route of [...requestOtpRoutes, ...signupRoutes]) {
        const cfnRoute = route.node.defaultChild as apigwv2.CfnRoute;
        stage.addDependency(cfnRoute);
      }
    }

    // ---------------- CloudFront ----------------
    const oac = new cloudfront.S3OriginAccessControl(this, "FrontendOAC", {
      signing: cloudfront.Signing.SIGV4_ALWAYS,
    });

    const distribution = new cloudfront.Distribution(this, "CdnDistribution", {
      defaultRootObject: "index.html",
      domainNames: [appDomain],
      certificate,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(frontendBucket, {
          originAccessControl: oac,
        }),
        viewerProtocolPolicy:
          cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    // ---------------- DNS ----------------
    new route53.ARecord(this, "AppARecord", {
      zone: hostedZone,
      recordName: appDomain,
      target: route53.RecordTarget.fromAlias(
        new route53targets.CloudFrontTarget(distribution)
      ),
    });
    new route53.AaaaRecord(this, "AppAaaaRecord", {
      zone: hostedZone,
      recordName: appDomain,
      target: route53.RecordTarget.fromAlias(
        new route53targets.CloudFrontTarget(distribution)
      ),
    });

    // ---------------- Outputs ----------------
    new cdk.CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "CoachStreamUrl", { value: coachFunctionUrl.url });
    new cdk.CfnOutput(this, "FrontendBucketName", {
      value: frontendBucket.bucketName,
    });
    new cdk.CfnOutput(this, "DistributionId", {
      value: distribution.distributionId,
    });
    new cdk.CfnOutput(this, "DistributionDomain", {
      value: distribution.distributionDomainName,
    });
    new cdk.CfnOutput(this, "AppUrl", { value: `https://${appDomain}` });
    new cdk.CfnOutput(this, "AuthFnName", { value: authFn.functionName });
    new cdk.CfnOutput(this, "ApiFnName", { value: apiFn.functionName });
    new cdk.CfnOutput(this, "CoachFnName", { value: coachFn.functionName });
    new cdk.CfnOutput(this, "JwtSecretArn", { value: jwtSecret.secretArn });
    new cdk.CfnOutput(this, "AnthropicSecretArn", {
      value: anthropicSecret.secretArn,
    });
    new cdk.CfnOutput(this, "OwnerEmail", { value: ownerEmail });
  }
}
