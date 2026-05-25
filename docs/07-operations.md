# 07 — Operations: Cost, Admin, Feedback

Running the app: controlling AI cost per user, the admin dashboard, and the feedback
loop that improves coaching over time.

---

## 18. Cost Control

The app is intended to be free.

But if AI cost per user becomes high, users may be asked to help defray the cost.

**Functional requirements:**

- Track AI usage per user
- Estimate AI cost per user
- Track cost per relationship/thread
- Use cheaper models for simple tasks
- Use stronger models for sensitive/high-risk messages
- Notify high-usage users
- Set optional monthly soft threshold, such as $10/user
- Allow contribution/payment if user exceeds threshold
- Admin can monitor cost

---

## 19. Admin Functionality

Admin dashboard should show:

- User count
- Active relationships
- Active threads
- AI usage
- Estimated AI cost
- High-cost users
- Safety incidents count
- Feedback reports
- System errors
- Model usage

Admin access to message content should be restricted by design unless explicitly
required for support or safety review.

---

## 20. Feedback

Users can provide feedback on AI suggestions.

**Feedback options:**

- Helpful
- Too soft
- Too harsh
- Missed the point
- Felt biased
- Made it worse
- Good rewrite
- Bad rewrite

Feedback should improve future coaching for that user and relationship.
