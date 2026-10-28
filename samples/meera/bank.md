Story bank (Meera Iyer, fictional sample persona)

**Fictional.** Meera Iyer, her employers, colleagues and numbers are invented for the public demo of Voice Proof Desk. Any match with a real person or company is chance. This file is written to read like unedited dictation, so the tool sees the same shape of input a real user gives it.

===
# Session 1 (dictated in parts)

1. I'm a senior product manager. Ten years in product in total, the last six in logistics software. Before that I was a business analyst for about two years at a bank's operations team.
2. Right now I'm at a company I'll call FleetGrid. It's a mid-size SaaS company that sells dispatch and tracking software to regional trucking firms. I joined in March 2021 as a product manager and became senior product manager in April 2023.
3. My area is the carrier app and the exceptions desk. The exceptions desk is where dispatchers handle the loads that go wrong, like a late pickup, a wrong address or a damaged shipment.
4. The biggest thing I shipped is an AI triage feature for that exceptions desk. Every exception that came in got a suggested category and a suggested next step. Before that, dispatchers read every ticket from scratch.
5. I didn't write the model. Our ML engineer, two backend engineers and one designer built it with me. I wrote the spec, I set up the evaluation, and I ran the pilot.
6. The evaluation was the part I cared about most. We took 400 past exceptions that dispatchers had already closed, and two senior dispatchers labelled the right category for each one. That was our test set, and nobody was allowed to tune the prompt on it.
7. The first version got 71 percent of categories right on that set. That was not good enough to ship, because a wrong category sends the ticket to the wrong team.
8. We changed it so that it only suggested a category when it was confident, and otherwise it said "needs a human". On the cases where it did suggest, it was right 92 percent of the time, and it suggested on about 64 percent of tickets.
9. We piloted it with three customers for six weeks. Median time to the first action on an exception went from about 19 minutes to about 11 minutes across those three customers. I want to be careful here, it was three customers, so it is a pilot number, not a company-wide number.
10. One thing went wrong in the pilot. The model started tagging every weather delay as a "carrier fault", because one customer typed weather notes in the carrier field. We caught it because I had asked for a weekly sample review of 30 suggestions. We fixed the input mapping, not the model.
11. My lesson from that is that a weekly human review of a small sample is cheaper than any dashboard, and it catches the strange failures.
12. The second thing I'd talk about is a failed launch. In 2022 we built a self-serve onboarding flow for small carriers. I pushed for it. Sign-ups went up but almost none of those carriers became paying accounts in the first quarter. About 4 percent converted.
13. What I learned is that small carriers didn't want self-serve, they wanted a phone call. We kept the flow for lead capture and put a sales call behind it. I would not call that launch a success, and I say so when people ask.
14. I lead without being anyone's manager. I work with one engineering manager, and my team is about seven engineers, one designer and a part-time data analyst.
15. Stakeholders I work with most are the head of customer success and the VP of product. I send a written weekly update every Friday, one page, with what shipped, what slipped and why.
16. I took a career break from June 2019 to February 2020, about eight months. My father had heart surgery and I was the one at home to look after him. During that time I did an online course in SQL and product analytics, and I finished it.
17. When I came back I joined a smaller logistics startup as a product manager for about a year, then moved to FleetGrid.
18. I've never had a referral for any of my jobs. Every role I got was through a cold application or a recruiter message. I find asking for referrals uncomfortable, because I don't like asking people I don't know well.
19. Why I'm looking now: FleetGrid is moving my area into maintenance mode and I want to keep working on applied AI in operations software.
20. What I want next is a senior PM role where AI is in the core workflow, and the team actually measures whether it works.
21. Tools I use day to day: Jira, Figma for reviewing designs, Amplitude for product data, and SQL on our warehouse. I can write basic SQL queries myself. I don't write production code.
22. I'm based in Pune and I'm open to remote roles or to hybrid in Pune.

===
# Session 2, follow-up answers

23. On the triage evaluation, the 400 cases were from the previous four months of closed exceptions, and we removed duplicates first.
24. The two dispatchers disagreed on about 1 in 10 cases. For those, the dispatch lead made the final call. I wrote that down as our tie-break rule before we started.
25. I have not built an evaluation for a generative model, only for classification. If someone asks, I say that plainly.
26. The 19 to 11 minutes number is the median, not the average. The average moved less, because a few very long cases stayed long.
27. I have never managed people directly. I mentored one associate product manager for about a year.
28. I speak English, Hindi and Marathi. I write product documents in English.
