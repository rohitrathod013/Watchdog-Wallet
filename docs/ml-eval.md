# Grace's on-device ML: evaluation

> **All numbers are on synthetic data** (seeded fake accounts from `src/lib/ml/synthetic.js`), plus the demo's sample data for one forecast backtest. They show the models behave sensibly on known, planted cases. They are **not** a measure of accuracy on real people's money, which is messier. Re-run with `npm run eval`.

## Anomaly detection (synthetic data)

30 accounts with 6 months of spending and 5 planted incidents each (a duplicate charge, a 10× outlier, a big first payment to a new shop, a subscription price rise, and a deliberately subtle one: about 2× a normal grocery shop). 30 clean accounts with nothing planted.

| Sensitivity | Precision | Recall (all 5) | Recall (without the subtle one) | False flags per month, clean accounts |
| --- | --- | --- | --- | --- |
| low | 96.8% | 60.7% | 75.8% | 0.02 |
| medium | 90.1% | 78.7% | 95.8% | 0.04 |
| high | 83.3% | 93.3% | 99.2% | 0.13 |

Recall by incident type, medium sensitivity:

| Incident | Caught |
| --- | --- |
| duplicate | 30 of 30 (100.0%) |
| outlier | 25 of 30 (83.3%) |
| newMerchant | 30 of 30 (100.0%) |
| priceRise | 30 of 30 (100.0%) |
| subtle | 3 of 30 (10.0%) |

**A miss, on purpose:** in synthetic account s2, about 2× a normal shop at Trader Joe’s ($143 at Trader Joe’s) was not flagged. It's unusual, but not unusual enough for the forest to propose it and a z-score of 3 to confirm it. Raising the sensitivity catches more of these at the cost of more false flags. Precision here only counts the planted incidents as true, so a genuinely odd charge that happened by chance in the synthetic data counts against it.

## Forecast backtest (synthetic data and the demo)

From the 15th of each past month, forecast the balance at the end of the month using only what was known then, and compare with what happened.

| Data | Forecasts | p10 to p90 coverage (target about 80%) | Coverage, 60+ days of history | Median absolute error of p50 |
| --- | --- | --- | --- | --- |
| Synthetic, 20 accounts | 116 | 76.7% | 75.0% (76) | $136 |
| Demo sample data | 0 | n/a | n/a (0) | n/a |

The demo’s sample data spans too short a time for a backtest: each one needs two weeks of history before the 15th and the whole month after it. So the forecast is only measured on synthetic data here.

## Categorizer (synthetic data)

10 synthetic accounts; each one's spending split 70/30 at random.

| Setup | Accuracy on the held-out 30% |
| --- | --- |
| Trained on the account’s own 70% plus the seed dictionary | 99.5% |
| New account: seed dictionary only | 80.8% |
| … after 5 corrections | 93.5% |
| … after 20 corrections | 99.5% |
| … after 50 corrections | 99.5% |

Corrections are simulated as the user fixing each wrong guess in date order. Synthetic names repeat a lot, which flatters these numbers.

_Generated 2026-11-12 in 4.4s._
