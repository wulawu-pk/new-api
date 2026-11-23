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
 * English translation of the user agreement (source: the Chinese text set in
 * the admin settings, drafted in ai-relay/deploy/legal/user-agreement.md).
 * Shown when the interface language is English; the Chinese version
 * prevails. Keep it in step, clause for clause, when the Chinese text
 * changes.
 */
export const USER_AGREEMENT_EN = `**Last updated: 2026-11-15　Effective: 2026-11-15**

Welcome to peroai. This agreement is made between you and the operator of peroai ("the Site"). It applies to the model APIs, account console, top-up and other related services provided at peroai.cc, api.peroai.cc and related subdomains.

Service contact: [support@peroai.cc](mailto:support@peroai.cc).

Please read this agreement carefully before signing up, **especially the clauses on regions and compliance, billing, top-ups, refunds and limitation of liability**. By ticking "I have read and agree" and completing sign-up or sign-in, you accept this agreement and the [Privacy Policy](/privacy-policy).

## 1. Scope of service and eligibility

1. The Site provides access to third-party AI models, request forwarding, usage statistics and billing, and is an independently operated platform. The Site does not represent any model vendor and is not their official agent or partner. Model names are used only to identify the corresponding services; trademarks belong to their respective owners.
2. You must be at least 18 years old, or have full civil capacity appropriate to the use of this service. If you use the service on behalf of an organisation, you must confirm that you are authorised by it.
3. **You must confirm for yourself that using this service in your country or region complies with local laws and regulations, and with the restrictions on region, entity and purpose set by the providers of the models you call.** You may not use false information or other means to get around these restrictions, nor provide this service to third parties who do not meet the eligibility requirements.
4. If you do not meet the conditions above, stop using the service immediately. The Site may refuse, restrict or terminate the related services on these grounds.

## 2. Accounts and API keys

1. You must provide true and valid registration information (including your email address), and keep your account password, two-factor authentication device, passkeys and API keys safe.
2. **Requests made through your account or API keys are deemed to be your own actions, and the resulting charges are paid from your account balance.** If a key is leaked, disable or delete it in the console at once and contact the Site. Usage incurred before you notify the Site and the Site has had reasonable time to act is billed under the normal rules.
3. The Site will never ask for your password, verification codes, API keys or wallet seed phrase by direct message, email or any other channel, and will never privately give you a new top-up address.
4. Without the Site's consent, you may not sell, rent or transfer your account, or register accounts in bulk.

## 3. Rules of use

1. You must confirm for yourself that your purpose of use, the content you submit and its subsequent use comply with applicable law, and that you hold the necessary rights and authorisations.
2. You may not use the Site to: commit fraud or other illegal activities; infringe others' privacy, intellectual property or other lawful rights; generate or spread illegal or harmful content or malicious programs; attack, scan or interfere with the Site or upstream systems; fake transactions or maliciously consume resources; or circumvent technical measures such as rate limits, billing, access control or group restrictions.
3. You may not violate the usage policies of the providers of the models you call.
4. Without permission, you may not copy, sell or misuse the Site's name, logo, page content or protected technical work.
5. Third-party claims, actual losses attributable to you and reasonable enforcement costs arising from your violation of law or of this agreement are borne by you in accordance with the law.

## 4. Model output and risks of use

1. **AI output may contain errors, omissions, fabrications, bias or outdated information.** You must verify the accuracy and suitability of the output and your right to use it, and you are responsible for decisions made on it and its further use.
2. The Site does not guarantee that output fits your particular purpose, that it is unique, or that it does not involve third-party rights. Output should not be the sole basis for medical, legal, investment or other major decisions.
3. Assess for yourself the risk of submitting sensitive information, trade secrets and other restricted material to models. Do not submit other people's personal information or material without authorisation.

## 5. Groups, billing and prices

1. A group must be chosen when you create an API key. Groups differ in available models, price ratios, stability and conditions of use, as shown at the time in the [model plaza](/pricing) and the [group notes](/docs/groups/). **Restrictions stated in the group notes (for example, only certain clients are supported, or the upstream adds a prompt) are part of that group's service**, and choosing the group means accepting them.
2. Account credit is denominated in US dollars ($). Charges follow the model price, group ratio, usage and billing rules that apply at the time of the call. Billing may be by input, output, cache reads and writes, per call, per image, per second, per credit and so on, as shown on the pages at the time.
3. **A request that times out, a client that disconnects, a request that is cancelled or a result that is not fully received does not mean no charge was incurred.** Usage that the upstream actually processed and that falls under the billing rules is billed as normal; requests that a client resends or retries automatically may each incur charges.
4. The Site may change the prices, groups, model range and usage limits for later calls; changes take effect from the time they are announced. Consumption that has already occurred is settled under the rules that applied at the time.
5. If you dispute a charge, provide the request id, time, model, group and other information needed to check it. Where a check confirms a system error or a duplicate charge, the Site will correct it.

## 6. Top-ups

The Site supports the following top-up methods; the steps for each are in the [top-up guide](/docs/recharge/).

### WeChat Pay / Alipay (redeem codes)

1. Redeem codes are sold through the third-party shop "链动小铺" (Liandong Shop), and payment is made in that shop. Once redeemed, a code is credited at its face value, ¥1 = $1 of credit.
2. **A redeem code is equivalent to cash and can be redeemed only once.** Keep it safe and do not show it to others. The Site cannot recover losses caused by a code being redeemed by someone else or leaked.

### USDT / USDC (cryptocurrency)

1. Before paying, check the currency, network, receiving address, amount and order validity period. **You must pay the full amount shown at checkout**, without omitting, changing or rounding the decimal part; to tell apart orders paid at the same time, the checkout amount may be 0.01–0.02 more than the amount you entered, and this difference is part of the payment.
2. Exchange withdrawals and on-chain transfers may charge fees. You must make sure the amount actually received at the receiving address matches the order amount; the amount debited as shown by an exchange alone does not prove the payment is complete.
3. An order is credited automatically only if it is paid within its validity period (currently 30 minutes). **An order completed normally is settled at the exchange rate and credit locked when the order was placed**, and is not recalculated for later exchange rate changes.
4. **Sending to the wrong network, currency or address, paying an amount that does not match, or paying an expired order may delay crediting, make the payment unidentifiable or make the assets unrecoverable.** The risk and actual handling costs arising from your own mistakes are borne by you in accordance with applicable law; the Site does not undertake to recover assets that are beyond its control or technically unrecoverable.
5. On-chain confirmations, exchange reviews and network congestion may affect the crediting time. After paying, keep the order number and the transaction hash (TxID); do not transfer again or top up the difference.

## 7. Balance and refunds

1. The account balance can be used only to buy the Site's services. It bears no interest, carries no promise of returns, cannot be withdrawn, and cannot be transferred to other accounts or exchanged for other assets.
2. **Except as otherwise required by applicable law, once a top-up succeeds the Site does not accept refund requests for personal reasons such as a change of plans, stopping use, or feeling that a model did not meet expectations.** Services provided as agreed and billed correctly are not refunded.
3. System errors, duplicate charges, cases where the Site cannot provide the service for which it received payment, and cases where a refund is required by law are handled according to the result of a check. You must provide the transaction records needed for the request.
4. Gifted, promotional or reward credit cannot be converted to cash, unless the rules of the related campaign say otherwise.
5. If a refund is approved, its currency, amount, conversion basis and any necessary network fees will be confirmed with you before it is processed. The Site does not recalculate the exchange rate at a moment of your choosing, and does not refund unverified transactions to unconfirmed addresses.
6. After you delete your account in the console, any remaining balance expires with the account and is not refunded. If there is a balance to deal with, contact the Site before deleting.

## 8. Service changes and handling of violations

1. Model capabilities, APIs, groups, concurrency limits and availability may change for operational reasons, upstream policies, maintenance or technical reasons. **The Site does not promise that all models and groups will remain available, nor a fixed response speed or entirely uninterrupted service.** The live availability of each group can be seen on the [service status](/status) page.
2. For violations of this agreement, suspected fraud, attacks, infringement, circumvention of restrictions or other conduct that endangers the security of the service, the Site may, depending on the circumstances, refuse requests, restrict features, or suspend or terminate the service; in an emergency it may act immediately.
3. For orders with a reasonable transaction risk, the Site may suspend processing and verify them to the extent necessary. The related transactions, balance and disputes are handled under this agreement and applicable law.
4. After the service has been restricted, you may not continue to use the Site by circumventing technical measures. The Site reserves the right to pursue liability in accordance with the law.

## 9. Privacy and data processing

1. To carry out API calls, billing, payment verification and the necessary troubleshooting and security handling, the Site needs to process related account, usage and transaction information. See the [Privacy Policy](/privacy-policy) for details.
2. When you use third-party model services, the content of your requests has to be sent to the upstream providers and model vendors that actually provide those services. Their processing after receipt is also subject to their own data processing rules.
3. The Site is not a storage or backup service. Back up any output and business material you need to keep long term.

## 10. Limitation of liability

1. The Site provides the service within the scope of the features it can actually provide, and makes no guarantee about your particular business goals, expected returns, the quality of model output or the performance of third-party services.
2. To the extent permitted by applicable law, the Site is not liable for indirect, incidental or special losses, including loss of expected profits, business opportunities and derivative business.
3. **For general compensation for breach where a liability cap may lawfully be agreed, the Site's total liability is limited to the service fees actually received for the related service that gave rise to the dispute in the twelve months before the event.** Amounts that must be refunded by law do not count toward this cap.
4. This clause does not apply to fraud, intent or gross negligence, or other liability that cannot be excluded or limited by law. Your statutory rights that cannot be excluded by contract are not affected.

## 11. Changes to this agreement and dispute resolution

1. The Site may revise this agreement as the service changes or as the law requires, and will publish the new version and its effective date. Changes that affect your material rights will be notified by site announcement, email or other reasonable means; where the law requires your consent to be obtained again, the Site will do so accordingly. If you keep using the service after a change takes effect, you are deemed to accept the revised agreement.
2. The conclusion, performance and dispute resolution of this agreement are governed by the law that applies by law, without excluding mandatory provisions. In the event of a dispute, you may first seek to resolve it through [support@peroai.cc](mailto:support@peroai.cc); if that fails, the dispute shall be submitted to a court with jurisdiction under the law.
3. If any clause of this agreement is invalid or unenforceable, the validity of the other clauses is not affected.
`
