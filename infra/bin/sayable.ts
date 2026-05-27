#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { SayableStack } from "../lib/sayable-stack";

const app = new cdk.App();

const rootDomain = process.env.ROOT_DOMAIN ?? "sayable.org";
const appDomain = process.env.APP_DOMAIN ?? "sayable.org";

const otpSenderEmail =
  process.env.OTP_SENDER_EMAIL ?? "muthu.vellayan@nayalle.com";
const notificationSenderEmail =
  process.env.NOTIFICATION_SENDER_EMAIL ?? otpSenderEmail;

const ownerEmail = process.env.OWNER_EMAIL ?? "muthu.vellayan@gmail.com";

new SayableStack(app, "SayableStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
  rootDomain,
  appDomain,
  otpSenderEmail,
  notificationSenderEmail,
  appBrand: process.env.APP_BRAND ?? "Sayable",
  ownerEmail,
});
