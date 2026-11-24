/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
/*
 * English translation of the privacy policy (source: the Chinese text set in
 * the admin settings, drafted in ai-relay/deploy/legal/privacy-policy.md).
 * Shown when the interface language is English; the Chinese version
 * prevails. Keep it in step, clause for clause, when the Chinese text
 * changes.
 */
export const PRIVACY_POLICY_EN = `**Last updated: 2026-11-24　Effective: 2026-11-24**

This policy explains what information peroai ("the Site") collects when you use peroai.cc, api.peroai.cc and related services, how it is used and shared, how long it is kept, and the rights you have. This policy forms part of the [User Agreement](/user-agreement).

If you have questions, contact [support@peroai.cc](mailto:support@peroai.cc).

## 1. Information we collect

### 1. Account information

- The username, email address and password you enter when signing up. **Passwords are stored only as irreversible cryptographic hashes**; the Site cannot see your plaintext password.
- Security settings you turn on yourself, such as two-factor authentication and passkeys.
- Your settings in the console, such as the notification method and the low-balance reminder threshold.

### 2. API keys and call records

For every call to a model API, the Site records: the time, the name of the key used, the group, the model, the number of input / output / cache tokens or other billed usage, the credit charged, the duration, whether it was streamed, the request id, and the error message when a call fails. These records are used for billing, reconciliation, troubleshooting and preventing abuse; you can view and export your own records under "Usage logs" in the console.

**The Site does not store the body of your requests and responses in its database** (prompts, conversation content, generated images or videos). Request content passes through the Site's servers while it is forwarded, but is not kept. The result files of asynchronous tasks such as videos are stored by the third-party model provider; the Site stores only the task id and status.

### 3. IP addresses and access information

- **IP addresses are not recorded in call records by default.** You can turn on "Record IP address" on the "Security" page; usage logs and error logs after that will include the source IP of each request, so you can check unusual calls.
- Security operations such as signing in, changing your password and deleting your account record the IP address and time, for account security auditing.
- The web servers produce operational logs containing the visiting IP, the path and the time, used for troubleshooting and defending against attacks; they are overwritten on a rolling basis by log size.

### 4. Top-up and transaction information

- **Redeem-code top-ups**: you pay in the third-party shop "链动小铺" (Liandong Shop). The Site does not receive your WeChat or Alipay account information, and records only the redemption time and face value of the code.
- **Cryptocurrency top-ups**: the Site records the order number, currency, network, amount paid, locked exchange rate, credited amount and order status, as well as the public on-chain data needed to identify the payment, such as the transaction hash and the paying address.

### 5. Information you provide when contacting the Site

When you contact the Site by email, the Site keeps the correspondence and the information you provide to help check an issue (for example, order numbers, transaction hashes and request ids).

## 2. How we use information

The Site uses the information above only to the extent necessary for the following:

- Providing the service: signing in, forwarding requests, deducting credit and crediting top-ups;
- Billing and reconciliation: producing usage logs and bills, and handling charge disputes and top-up issues;
- Security: detecting and stopping account theft, fraud, attacks and conduct that violates the User Agreement;
- Notifications: sending email verification codes, password reset emails, low-balance reminders and notices of important service changes;
- Improving the service: aggregating metrics such as availability and latency by group (the "Service status" page shows aggregated data that contains no personal information).

**The Site does not sell your personal information, does not use it for advertising, and does not use your request content to train models.** The website includes no third-party analytics or advertising tracking code.

## 3. Who we share information with

To provide the service, the following third parties process related information within the scope of their own roles:

| Third party | Purpose | Information involved |
|---|---|---|
| Third-party model providers and model vendors | Actually processing your model requests | The request content you submit |
| Cloudflare | DNS, network acceleration and protection, email forwarding | Visiting IP, request data (encrypted in transit), emails sent to the support address |
| Tencent Cloud (Singapore) | Server hosting | All data stored by the Site |
| Resend | Sending verification codes and notification emails | Your email address and the email content |
| 链动小铺 (Liandong Shop) | Selling redeem codes, handling WeChat Pay / Alipay payments | The payment information you submit in that shop, subject to its own rules |
| Blockchain networks and node providers | Checking cryptocurrency payments | Public on-chain transaction data |

**Your request content is sent to third-party model providers and model vendors, and its processing is subject to their own data processing rules**; the Site cannot control how long they keep it. Do not submit personal information, trade secrets or other restricted material that you have no right to submit.

Apart from the cases above, the Site discloses your information only: with your consent; when required by laws and regulations or by judicial or administrative authorities in accordance with the law; or when necessary to protect the personal or property safety of the Site, its users or the public.

## 4. Cookies and local storage

The Site uses necessary cookies to keep you signed in, and stores preferences such as the interface language, theme and table pagination in the browser's local storage. This information is used only for the website's own features, not for cross-site tracking. Clearing your browser data signs you out and restores the default settings.

## 5. Storage and security

1. Data is stored on servers in Singapore, backed up daily, and backups are kept for 7 days.
2. The website and the API use HTTPS encryption throughout. Internal services such as the database and cache are not exposed to the public internet, and back-office administration is accessible only to the Site's operators.
3. No security measure can be absolutely secure. If a security incident occurs that may affect your rights, the Site will inform you promptly in accordance with the law, and explain the measures taken and the precautions you can take.

## 6. Retention periods

- Account information, call records and top-up records are kept for as long as the account exists, for reconciliation and dispute handling.
- After an account is deleted, the Site stops using your account information. Transaction and security records needed to handle transaction disputes, meet legal obligations and carry out security audits are kept for the necessary period, and deleted or anonymised when it ends.
- Server operational logs are overwritten on a rolling basis by size, usually within a few weeks.

## 7. Your rights

- **View and export**: view your profile, API keys, usage logs and top-up records in the console, and export your usage logs.
- **Correct**: change your username, email, password and security settings in your personal settings.
- **Turn off IP recording**: turn IP recording for call logs on or off at any time on the "Security" page.
- **Delete your account**: delete your account on the "Security" page. After deletion you can no longer sign in, the API keys under the account stop working, and the remaining balance is not refunded (see section 7 of the User Agreement).
- **Other requests**: to get a copy of your personal information, delete specific data or withdraw consent, email [support@peroai.cc](mailto:support@peroai.cc). To protect your account, the Site will first verify your identity, and will reply within a reasonable time.

## 8. Minors

This service is intended for adults. The Site does not knowingly collect personal information from minors; if it finds that it has done so by mistake, it will delete the information as soon as possible.

## 9. Changes to this policy

The Site may revise this policy as the service changes or as the law requires, and will publish the new version and its effective date on this page. Changes that affect your material rights will be notified by site announcement, email or other reasonable means.
`
