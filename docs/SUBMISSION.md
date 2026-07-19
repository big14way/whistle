# Superteam Earn submission, Prediction Markets and Settlement (TxODDS)

Everything below is ready to paste into the submission form.

Reminder: the "Link to your Live Demo Video" must be the full judge cut
(`video/out/whistle-demo.mp4`, ~4 min), not the 60 second social cut — the track is
judged heavily on the video. The social cut (`whistle-social.mp4`) is for the
optional Tweet field.

## Form fields (copy paste)

### Link to Your Submission (most useful link)

https://youtu.be/P2H0fPXBpJw (the track is judged heavily on the video). Live MVP:
https://whistlesol.vercel.app

### Tweet Link (optional)

Your X post link if you posted the social cut. Otherwise leave blank.

### Project Title

Whistle

### Briefly explain your Project

Whistle is trustless, per stat prop settlement for football on Solana. Every market is
a predicate over a real match statistic (a first half goal, total corners, a winning
margin). The instant TxLINE anchors that stat on chain, anyone can settle,
permissionlessly: the program makes a single Cross Program Invocation into TxLINE's
validate_stat, which verifies the stat against the on chain Merkle root and returns a
boolean, so the winning side is paid pro rata in one block. No dispute window, no
resolver, no trusted admin, the proof is the authorization. It settles fine grained in
game props instantly and trustlessly, even proving negations (a market can settle NO),
which UMA and Chainlink based markets structurally cannot do, and markets can pay out
before the match is even over.

### Link to your live and working MVP

https://whistlesol.vercel.app

### Link to your Live Demo Video

https://youtu.be/P2H0fPXBpJw

### Project's Public Repository Link

https://github.com/big14way/whistle

### Link to your Project's Technical Documentation

https://github.com/big14way/whistle#readme

(The README covers the problem, architecture, the settlement trust model, a reviewing
guide for the ~500 lines of resolution logic, and a roadmap. Deeper docs:
docs/SETTLEMENT.md for the settlement and safety spec, docs/ORACLE_FACTS.md for the
verified on chain oracle values.)

Specific TxLINE endpoints used:
- `POST /auth/guest/start` — mint a guest JWT (the auth bearer for data calls).
- `POST /api/token/activate` — activate the API token with the wallet signature over
  `{txSig}:{leagues}:{jwt}` (sent as `X-Api-Token` on data calls).
- `GET /api/scores/snapshot/{fixtureId}` — fixture snapshot (teams, state, start time).
- `GET /api/scores/historical/{fixtureId}` — historical SSE replay of anchored events.
- `GET /api/scores/stream` — live SSE scores stream (powers the live match ticker).
- `GET /api/scores/stat-validation?fixtureId&seq&statKey[&statKey2]` — the proof shape
  (statToProve, eventStatRoot, subTreeProof) the settle transaction submits on chain.
- On chain: a CPI into the txoracle `validate_stat` instruction (devnet program
  `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J`), whose Borsh bool return is read with
  `get_return_data` — this is what settles each market trustlessly.

### Link to your Project's X Profile or an X post about your Project

Your X profile or the post about Whistle, if any. Optional.

### Share your team's experience using the TxLINE API

What worked well: validate_stat is genuinely a settlement primitive, not just a feed.
It returns a Borsh bool that a calling program reads with get_return_data after a real
CPI, so trustless on chain settlement composes cleanly. The program addresses, the
soccer stat key encoding, and the on chain validation flow in the docs matched the
live IDL exactly, so declare_program! generated the CPI client with zero hand
transcription.

Where we hit friction: the full 28 instruction devnet IDL made declare_program! emit
invalid tokens (hardcoded addresses in the trading instructions), so we trimmed to a
validate_stat only IDL with the exact discriminator preserved. The SBF toolchain
(rustc 1.79) versus the edition2024 crate creep cost real time; we fixed it with an
MSRV aware lockfile plus blake3 pinned to 1.5.5. The guest JWT is IP bound
(maybeClientIp in the token), so a browser on a different IP than the activating
wallet gets 401 on data calls; we proxy TxLINE calls through the dev server. The
activate endpoint returns the API token as a plain text body, and data calls need
Authorization: Bearer jwt plus X-Api-Token: apiToken, not the documented Bearer
apiToken, confirmed empirically. The per update SSE stat shape and the two stat
eventStatRoot mapping are not fully spelled out in the docs; we built tolerant parsers
and confirmed them against a live payload (both stats share one eventStatRoot,
subTreeProof can be empty, period is 0 for full game keys at the anchored seq).

### Anything Else

A 60 second social cut is in the repo at video/ (Remotion project). Deployed on
devnet: program 9zhvjPzcUw4DZYBB7qSQ92pXyupkfV8ircrHW6dMAJpW, mock USDC
AjUYguAuwip6sqs3SimPGv4QLLuuEs3nwmUraTYN6v9Q, demo fixture 17588245 (Croatia 2 : 1
Ghana). The Milestone 0 gate passed (validate_stat returned true from a real CPI and
false for an unsatisfied predicate, both from real .rpc() transactions), and 8/8
lifecycle tests pass including the real validate_stat CPI. The demo runs against a
completed World Cup fixture replayed from real anchored data, so it is deterministic
and fully reproducible for judging.
