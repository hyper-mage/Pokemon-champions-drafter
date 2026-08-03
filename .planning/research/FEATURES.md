# Feature Research

**Domain:** Pokémon draft-tournament tooling (hot-seat, single-screen, static site)
**Researched:** 2026-08-03
**Confidence:** MEDIUM-HIGH — draft league norms and generic draft-board UX are HIGH (official Smogon articles, live league rulesets, vendor docs, open-source repos). Champions format specifics are MEDIUM-HIGH (three independent sources agree, but regulation sets rotate every ~2 months). Hot-seat hidden-information UX is MEDIUM (patterns confirmed in real party-game apps and esports draft, but no direct precedent for a blind ban phase on a shared screen).

---

## Tools Actually Surveyed

Everything below is grounded in these. Nothing here is an invented feature list.

**Pokémon-specific draft tools**

| Tool | What it is | Notable features |
|------|-----------|------------------|
| [DraftDex](https://draftdex.net/) | Hosted VGC-style draft league platform | Live interactive draft board, snake **or linear** order, pick timer, budget tracking, free agency with commissioner-set pickup limits/deadlines, **matchup planning with type coverage**, standings, replay links, auto-generated single/double elim brackets **with byes and consolation rounds**, custom draft-pool editor, Bo3 results **with per-match KO counts**, rules display page, Pokédex filter by type/name |
| [Drafty Sports](https://draftysports.com/pokemon) | Hosted fantasy-style draft board | Real-time board, **5 auction formats**, nomination queue ("Freeze Tag"), autodraft assistant, in-draft trades, **"Draft Rewind can fix any oopsy pick"**, CSV export, custom player-list upload |
| [Smogon Draft League Resources](https://www.smogon.com/forums/threads/draft-league-resources.3716128/) | The actual community standard: Google Sheets | Sample draft boards for 14 formats; league spreadsheets supporting **8–20 coaches × 6–10 weeks**; separate Bo1 and Bo3/VGC variants; per-Pokémon "Tera Tax" pricing; complex bans stored as **cell notes** |
| [pkmnDiscordBot](https://github.com/lancersimmons/pkmnDiscordBot) | Discord draft bot | 11-slot snake draft, **pick queueing with alerts when your queued pick is sniped**, search by type or tier, "which types are in high demand" analysis. Note: repo is stale, Discord API drift |
| [PorygonBot](https://github.com/PorygonBot/bot-ts) | Showdown battle stat tracker | Parses live Showdown battles for stats, pushes to draft-league.nl API |
| [ChampDex](https://champdex.com/guides/format-rules) | Champions trainer toolkit | Pokédex with ability filters, teambuilder with 66-stat-point enforcement, damage calc, speed tiers, spread solver, tier lists, replica-team codes |
| [randompokemon.co Draft League Generator](https://www.randompokemon.co/draft-league-generator) | Pool generator | Pool size 50–200+, exclude legendaries/mythicals, evolution-stage limits, **balanced type distribution**, generation filters, "generate 3–5 pools and vote on the most balanced" |

**Generic draft boards — the closest UX analogs, all one-screen commissioner-driven**

| Tool | Notable features |
|------|-----------------|
| [FanDraft](https://www.fandraft.com/how-it-works/) | **Commissioner Mode**: "make picks on behalf of any owner, **edit selections**, and pause or play the clock"; "run the whole thing from one laptop"; TV/projector output; on-the-clock indicator; auto-skip full rosters; per-team walk-up music; animated pick announcements |
| [Clicky Draft](https://clickydraft.com/) | Project to TV; "commissioner is able to make picks for any team and **correct potential mistakes**"; custom draft order; keepers; adjustable timer; rankings |
| [DRAFTNIGHT.tv](https://draftnight.tv/) | Snake / linear / custom order incl. **3RR (third-round reversal)**; up to 32 teams × 30 rounds; pick clocks 30s–20min; logos, colors, music, soundboard; players join via QR, no account; **$25–45/season** |
| [Commish Kit](https://commishkit.com/product/digital-fantasy-football-draft-board-kit/) | HDMI to TV; sells **"only the commissioner's device controls the board, so there's no risk of accidental picks"** as a headline feature |
| [HootDraft](https://github.com/mattheworres/hootdraft) (OSS) | "Large color-coded draft board updates live... made with large screens and projectors in mind"; autocomplete pick entry; drag-drop depth charts; customizable pick timers |
| [PHP Draft](https://github.com/Justinomics/phpdraft) (OSS) | Explicitly "useful for **offline drafts** instead of using fantasy provider online tools"; commissioner **gatekeeper mode** (reviews all picks before entry); big color-coded TV board |
| [theDraftNight](https://apps.apple.com/us/app/id1017177870) | 2.7★ — cautionary tale. Complaints: "confusing", "full of bugs", "menus block other views and cannot be dismissed", "deployed before it was fully finished" |

**Tournament management**

| Tool | Notable features |
|------|-----------------|
| [Challonge](https://kb.challonge.com/en/article/learn-about-challonge-competition-formats-1f8j1cf/) | 13 formats. Single elim (+ optional bronze match), double elim, round robin **with up to 3 configurable tiebreak rules**, Swiss (Median-Buchholz), free-for-all, leaderboard, and 4 two-stage group→final combos |
| [Pokémon Showdown `/tour`](https://www.smogon.com/player/issue2/all-about-scripted-tournaments) | Elimination with configurable loss count, round robin (+double RR), autodq, autostart, scouting toggle. Round robin explicitly warned as only viable for small fields |
| Real league rulesets ([Frost](https://frostpokemondraftleague.weebly.com/rules.html), [IPF](https://independent-pokebattling-federation.fandom.com/wiki/Draft_League_Rules), [ARK's](https://arkspokemondraftleague.weebly.com/rules.html)) | Standings = W/L, tiebreak = **differential** (surviving Pokémon or KO diff), then KOs-for, then head-to-head, then a playoff match. Top 4 cut into a bracket |

**Board-game precedent for the priority-card mechanic**

| Game | Mechanic |
|------|---------|
| [El Grande](https://www.ultraboardgames.com/el-grande/game-rules.php) power cards | Identical decks of cards **1–13**, one played per round to bid turn order. **"Once each player has bid a power card for the turn order, it is out-of-play for the rest of the game."** Played **face-up, in clockwise order**, and **"a player may not play a Power card bearing the value of a Power card that was already played in the same round"** — which eliminates ties entirely |
| [Libertalia](https://www.ultraboardgames.com/libertalia/game-rules.php) | Every player holds an **identical numbered hand**; all play one card face-down and **reveal simultaneously**; cards are arranged in numerical order; ascending rank acts first, descending rank picks loot; played cards are spent |
| [BGG: Auction — Sealed Bid](https://boardgamegeek.com/boardgamemechanic/2920/auction-sealed-bid) | "Typically some tie breaker mechanism is required" — common ones being closest-to-start-player or a secondary tie-break currency |
| [7 Wonders app](https://www.pixelatedcardboard.com/7-wonders-review/) | **Has no pass-and-play mode at all**, because simultaneous selection does not work on one device. Direct warning for the priority-card phase |

**Hidden information on a shared device**

| Source | Pattern |
|--------|---------|
| Werewolf / Mafia / [Spy](https://playspy.app/) / Imposter apps | Enter names → **pass the device** → tap to privately reveal → confirm → hand back → next player. Universally the pattern for secret info on one screen |
| [HexGrow](https://aethyrx.itch.io/hexgrow) (indie hotseat) | "Player Two closes their eyes while Player One chooses" — the zero-tech look-away pattern |
| [LoL blind ban phase](https://wiki.leagueoflegends.com/en-us/Team_drafting) | All players ban simultaneously; **bans are not revealed until the phase ends**; **duplicate bans across teams are allowed and both still apply** |
| [Airgapped QR transfer](https://github.com/mohankumarelec/airgapped-qr-code-transfer) | Proven offline device-to-device data transfer via QR chunks + webcam decode, no server |
| [Huddle](https://www.huddlenight.com/games) | Inverts the model — no shared screen, each phone is a private window |

---

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these and the tool feels broken relative to a spreadsheet, let alone to FanDraft or DraftDex.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Pool search by name** | Every single tool surveyed has it. HootDraft uses autocomplete; DraftDex has "search by name". With ~284 Champions species and a pool of 100+, visual scanning on a shared screen is unworkable | LOW | **NOT in current requirements.** Type-ahead over the snapshot; keyboard-first so the host can type what's called out |
| **Pool filter by type** (and Mega-capable) | pkmnDiscordBot, DraftDex, randompokemon.co all filter by type. It is the first question a drafter asks ("what Water types are left?") | LOW | **NOT in current requirements.** Filters must compose with the round's pool restriction (e.g. Mega round + Fire) |
| **Undo / edit the last pick** | Universal and explicitly marketed: Drafty's "Draft Rewind can fix any oopsy pick", FanDraft's "edit selections", Clicky's "Commish can fix mistakes", FantasyPros' per-pick Redo. **Hot-seat makes this more critical, not less** — the host is typing names dictated by other people over voice | MEDIUM | **NOT in current requirements. This is the single biggest gap.** Must be architected in from day 1 (state snapshot stack or event log); retrofitting undo onto mutable state is a rewrite |
| **Draft board — players × rounds grid** | The defining artifact of a draft. FanDraft, HootDraft, PHP Draft, Clicky, Sleeper all render a "large color-coded board" as the primary view; the Smogon community's whole workflow is a spreadsheet draft board | MEDIUM | **NOT explicitly in current requirements.** Doubles as the pick history feed and as the click target for undo |
| **Live per-player roster panels** | Users need to see teams filling in during the draft, not only at the end. Every tool shows rosters live | LOW | Current requirements only mention "reachable per player from the **completed** draft view" |
| **Clear "on the clock" / whose turn** | FanDraft ships a dedicated on-the-clock indicator; every board highlights the active picker | LOW | Partially covered by "tool resolves and displays the resulting pick order for the round" — needs to be a persistent, large, glanceable element on a shared screen |
| **"Up next" preview** | Standard in every draft board; lets the next player start thinking | LOW | Free once pick order is resolved |
| **Drafted Pokémon leave the pool immediately** | Species clause is a hard Champions rule ("a player's team cannot contain two Pokémon of the same species") and every league enforces a single shared pool | LOW | Already covered |
| **Standings with at least one tiebreaker** | Every real Pokémon league uses **differential** then head-to-head. Challonge exposes up to 3 tiebreak rules. Pure W/L ties constantly at 4–8 players in a single round robin | LOW–MEDIUM | **Gap: current requirements capture only "the winner of each match".** Capturing one extra integer per match (Pokémon remaining / KO diff) is minutes of work and is the actual community standard |
| **Byes for non-power-of-two counts** | 4–8 players means 5, 6, 7 happen constantly. DraftDex advertises byes explicitly | MEDIUM | Already covered |
| **Round robin for small fields** | For 4–8 players, round robin is the consensus correct format — 4 players = 6 matches, 6 = 15, 8 = 28. Single elim alone means half the field plays once, which defeats the point of a friends event | MEDIUM | Already covered |
| **Seeded cut from standings into the bracket** | The actual friends-group workflow is RR → top-N cut → seeded single elim. Frost League: "top 4 teams qualify". Challonge's two-stage formats exist for exactly this | MEDIUM | **Gap: RR and SE are listed as separate features with no seeding/cut path between them** |
| **Autosave + resume** | Drafts get interrupted. A browser refresh losing an hour of draft is catastrophic | MEDIUM | Already covered and well-specified |
| **Export teams as importable text** | The whole point of a drafter is handing off to a builder | LOW | Already covered. Verify pokebase.app's format separately |
| **Readable at a distance / on a shared screen** | Every board tool sells TV/projector output. Here one screen serves the whole group by definition | LOW–MEDIUM | The density toggle partly covers it, but "legible from across the room" should be an explicit acceptance criterion, not an afterthought |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Composition rules compiled into round structure** | **Nothing surveyed does this.** Every other tool enforces composition after the fact — points budgets, mandatory tier slots (Frost's "1 Tier 1, 1 Tier 2, 2 Tier 3..."), or post-hoc validation. Making invalid teams unrepresentable removes an entire class of arguments and greyed-out-button UI | MEDIUM–HIGH | The strongest genuinely novel idea in the design. **Requires the full round schedule to be visible before drafting starts** (see priority cards below) |
| **Priority cards for pick order** | No Pokémon draft tool has anything but snake/linear/auction. Board-game precedent (El Grande, Libertalia) proves the mechanic is fun and **fair by construction** — every player plays each value exactly once, so total priority is identical | MEDIUM | See the dedicated section below; there are real edge cases that must be resolved before build |
| **Blind ban phase that works on one screen** | LoL's blind ban is beloved and no Pokémon tool implements bans at all (leagues maintain banlists in spreadsheet cell notes). Solving it for hot-seat is a genuine first | MEDIUM–HIGH | Highest UX risk in the project. Concrete options below |
| **Zero install, zero account, offline, free** | Every competitor is a hosted service. DRAFTNIGHT charges $25–45/season. DraftDex/Drafty/Clicky all require signup. The Smogon community's actual alternative is a Google Sheet | LOW (it's the architecture) | Lead with this. "Open the link, draft, close the tab" |
| **Champions legality as the product** | ChampDex is the only Champions-specific tool and it is a *teambuilder*, not a drafter. Every draft tool surveyed targets SV/NatDex/VGC. **Champions has no banned Pokémon — legality is exactly the current regulation roster**, so "Champions-legal" is a crisp, checkable claim | MEDIUM | Depends entirely on roster sourcing |
| **JSON export/import of the whole tournament** | No surveyed tool lets you own your tournament data as a file. It is also the honest answer to "no accounts" | LOW | Already covered. Also the recovery path when something breaks |
| **Type-coverage panel per drafted team** | DraftDex sells "matchup planning — analyze opponent threats and type coverage" as a headline feature. From a static type chart + 6 species this is pure client-side computation with zero data maintenance | LOW–MEDIUM | Genuinely useful during a draft ("we have no Steel resist"). **This is not a teambuilder** — no moves, items, EVs. Keep that line bright |
| **Pick announcement moment** | FanDraft programs per-team walk-up music; DRAFTNIGHT ships a soundboard. On a shared screen with friends on a call, a big sprite + name reveal is most of the party feel for almost no code | LOW | Cheap delight. Must be skippable/fast — nobody wants a 3-second animation × 48 picks |
| **Swaps as both mid-draft currency and post-draft rounds** | Real leagues have free agency but only *between weeks* (DraftDex: "swap roster Pokémon with undrafted free agents mid-season"). Mid-draft swap currency is a novel response to getting sniped | MEDIUM | Smogon's guide names "snipes and substitutions" as the core drafting stress; this mechanic directly targets it |
| **Host-selectable tournament depth** | Every tournament tool forces full setup. Being able to say "draft only, we're done" is real friction removal for a 45-minute session | LOW | Already covered |

### Anti-Features (Commonly Requested, Often Problematic)

**Author's existing exclusions — all CONFIRMED, with evidence:**

| Feature | Why Requested | Why Problematic | Verdict |
|---------|---------------|-----------------|---------|
| **Cross-device real-time multiplayer** | "Everyone picks on their own phone" is what every hosted tool does | Requires a backend, which is the entire premise being avoided. Notably, **Commish Kit markets single-device control as a *feature*** ("no risk of accidental picks"), and FanDraft's Commissioner Mode ("run the whole thing from one laptop") is a first-class mode, not a degraded fallback. The one-screen draft is a legitimate, sold product category | **CONFIRM.** Keep the serializable-state decision so a sync layer stays possible |
| **Replay parsing** | Auto-detect winners and KO counts | PorygonBot already does this and needs a hosted bot plus continuous tracking of Showdown's log format. **More decisively: Champions battles happen in Pokémon Champions, not on Showdown — there are no replay URLs to parse for the actual use case** | **CONFIRM, strongly.** Reinforced by the format itself |
| **In-tool teambuilder** | Natural next step after drafting | ChampDex already does Champions teambuilding with 66-stat-point enforcement, a Champions damage calc, speed tiers and a spread solver. Champions also uses its own **66 Stat Points (max 32 per stat)** system instead of EVs — a whole second data model to get wrong | **CONFIRM, strongly.** Export and get out of the way |
| **Accounts / logins** | Persistence, sharing | No backend. JSON export is the honest substitute | **CONFIRM** |
| **Non-Champions formats** | Bigger audience | Every other tool already serves SV/NatDex/VGC and does it better. Champions specificity *is* the differentiator | **CONFIRM — with one nuance.** Champions legality is **versioned by regulation set** (M-A ran Apr 8–Jun 17 2026; M-B runs Jun 17–Sep 2 2026 and added 22 species + 13 new Mega options). "Champions only" still means supporting more than one roster version over time |
| **Native / downloadable builds** | — | Contradicts the delivery premise | **CONFIRM** |

**Additional traps to add to the exclusion list:**

| Feature | Surface Appeal | Why Problematic | Alternative |
|---------|----------------|-----------------|-------------|
| **A points / cost / tier valuation system** | *Every* real Pokémon draft league has one (Champions Draft Kickoff: 90 pts for 8 mons; Frost: 400 pts with mandatory tier slots; Smogon: 18–20 point brackets). Its absence will look like an omission | Bottomless maintenance sinkhole. Smogon re-tiers **every season**, tiering philosophy is itself a contested debate (traditional vs usage-based), and the values are the #1 source of league arguments. A committed static snapshot with stale point values is worse than no point values. It also directly conflicts with the round-structure design | Keep round structure + bans + priority cards as the balancing mechanism. If demanded later: **let the host paste a CSV of costs**, never ship an opinionated list |
| **Auction / nomination draft mode** | Drafty offers 5 auction variants; auction is widely considered the "purest" draft format | Auctions need bid clocks, nomination queues, budget tracking and per-player bidding. **Running one hot-seat by voice with a single mouse is miserable** — the host would be transcribing bids. Also 3–5× longer than a snake draft | Priority cards already provide the strategic tension auctions are wanted for |
| **Pick timer with auto-skip** | Every tool has one; Champions Draft Kickoff uses 12h→6h timers that halve on skip | Async leagues need timers because players are asleep. **Hot-seat players are on a voice call — the social clock already works.** A hard timer that auto-picks for a friend mid-sentence is actively hostile | If pacing is a real problem, ship an *optional, host-controlled, purely visual* elapsed-time display with no auto-action |
| **Pick queue / watchlist / snipe alerts** | pkmnDiscordBot's headline feature: queue picks, get alerted when sniped | Meaningless when everyone is watching the same screen and talking. The voice call *is* the alert | Nothing needed |
| **Autodraft / pick recommendations / "type demand" analysis** | pkmnDiscordBot recommends picks; fantasy tools ship autodraft assistants | Autodraft complaints are among the loudest in fantasy ("autodrafted terrible teams"). With humans present and talking, algorithmic suggestions are noise, and any recommendation engine invites endless "your tool says X is good but it isn't" | Type-coverage display gives information without giving opinions |
| **In-tool chat** | HootDraft, Clicky, theDraftNight all have it | Everyone is already on voice | Nothing |
| **Player-to-player trades** | Real leagues allow them (Frost: "trades between people are allowed"); Drafty and HootDraft support in-draft pick trading | A trade needs a proposal/accept state machine, multi-party UI, and validation against round structure. For a single-evening draft it is a lot of machinery for a rare event | Swaps already cover roster correction. If two friends want to trade, the host can undo/re-enter — which is another reason undo is P1 |
| **Double elimination / Swiss / consolation brackets** | Challonge ships 13 formats; it looks like the "complete" answer | **Losers-bracket layout is where bracket rendering code goes to die** (cross-drops, bracket resets, grand-final resets). Swiss needs pairing algorithms and Median-Buchholz. For 4–8 friends, round robin already gives everyone many games | Round robin + top-N seeded single elim covers >95% of this audience |
| **Third-place match, complex seeding algorithms, scheduling** | Toornament/start.gg territory | Solves problems that only exist at 64+ entrants with real stakes | Skip entirely |
| **Live phone-to-host sync via QR chunking for blind bans** | Technically proven, genuinely cool, no server needed | Airgapped QR transfer is a real engineering project (chunking, error correction, webcam permissions, lighting, iOS camera quirks) — for a payload of about 3 Pokémon IDs | A ~10-character paste code, or just passing the laptop |
| **Usage stats / analytics dashboard across tournaments** | "Which Pokémon get drafted most" | Needs many completed tournaments to say anything; at 4–8 players the sample is noise | The JSON export lets a curious host do this themselves |
| **Full-art / large-sprite gallery pool view** | Looks great in screenshots | Kills scan speed on a shared screen, which is the one screen everyone is reading. theDraftNight's 2.7★ reviews are a warning about prioritizing look over legibility | The existing density toggle is the right instinct — default to the *dense* end, not the pretty end |

---

## Deep Dive: The Hot-Seat Constraint

**The good news: this is a real, commercially-validated product category, not a compromise.**

- FanDraft: "run the whole thing from one laptop in Commissioner Mode — the modern replacement for the paper draft board"
- Commish Kit: "only the commissioner's device controls the board, so there's no risk of accidental picks"
- PHP Draft: explicitly built for "offline drafts instead of using fantasy provider online tools", with a **gatekeeper mode where the commissioner reviews all picks before entry**
- Clicky Draft: "the commissioner is able to make picks for any team and correct potential mistakes"

Framing follows directly: **the host is a scribe with an undo button.** Everything about the pick-entry UI should optimize for "a person is saying a Pokémon name out loud and the host is typing it": autocomplete, fuzzy match, enter-to-confirm, and an obvious undo.

Also relevant, from Smogon: **"data entry is the wage of running a draft league"**, and historically "the draft usually takes forever and it is too hard to get players coordinated enough." Hot-seat on a voice call annihilates both problems. That is the pitch.

### The blind ban phase — real options, ranked

Every option below is a pattern that exists in shipped software.

| Option | Precedent | Complexity | Assessment |
|--------|-----------|------------|------------|
| **1. Host-as-scribe / paste bans** | What real leagues actually do — players DM the host beforehand, host maintains the banlist | LOW | **Ship this first.** It always works, needs almost no UI, and it is the honest fallback when the fancy flow fails. Essentially the existing "host mode" extended to accept per-player attribution |
| **2. Look-away entry** | HexGrow: "Player Two closes their eyes while Player One chooses" | LOW | Zero tech. Socially fine among friends. Weakness: only works if people are physically co-located or willing to cover their eyes on camera |
| **3. Pass-the-device sequential secret entry** | The universal party-app pattern (Werewolf Master, Mafia Party, Wolvesville, Spy, Imposter): interstitial → private screen → confirm → hide → next | MEDIUM | **The best in-room experience.** Flow: full-screen takeover "Pass to Alice — tap only when only Alice can see", private ban picker, "Done — hand back" screen that immediately hides everything. Requires the pool UI to have a hard "nothing leaks" mode with no ban chips visible anywhere else |
| **4. Second-device submit code** | Not directly precedented, but trivially derived from the static-site architecture | MEDIUM–HIGH | Each player opens the same URL on their phone in "ban submitter" mode (works offline after first load), picks bans, gets a short alphanumeric code encoding species indices, reads it out or types it. Genuinely elegant, no server. Needs a compact reversible encoding + validation + a roster-version check so codes from a stale snapshot are rejected |
| **5. QR handoff** | [airgapped-qr-code-transfer](https://github.com/mohankumarelec/airgapped-qr-code-transfer) | HIGH | Overkill for a 3-item payload. Do not |

**Recommendation:** ship options 1 and 2 in v1 (they cost nearly nothing and unblock the feature), design option 3 properly as the intended experience, and treat option 4 as a v1.x delight.

**Rule gap that must be decided:** what happens when two players blind-ban the same Pokémon? LoL's answer is that **duplicate bans both apply and one is simply wasted**. The alternative is collapsing duplicates or granting a re-ban. This is not cosmetic — it changes the total number of Pokémon removed, which feeds directly into the "auto-size the draft pool" requirement. Pick one and state it in the UI before players submit.

**Also: bans are not the only hidden-information moment.** See below.

---

## Deep Dive: Priority Cards (1–6, one per round, spent permanently)

The mechanic has strong board-game precedent and is fair by construction — over the full draft every player plays every value exactly once, so nobody accumulates a priority advantage. That is precisely why El Grande and Libertalia use identical decks.

But the current spec has several unresolved edge cases, and one of them is a hard contradiction.

### Critical issue 1 — cards are hardcoded to 6, rounds are not

The requirements simultaneously state:
- "Each player holds priority cards numbered 1 through 6" / "Draft runs six rounds"
- "A requirement of N Mega Evolutions produces N Mega-only rounds"
- "Host can fine-tune round structure manually"
- "Host can additionally enable dedicated swap rounds after round six, **run in pick order**"

If the host produces anything other than exactly six pick rounds, the card mechanic breaks. And the post-draft swap rounds are specified to run "in pick order" at a point where **every card has already been spent**, so no pick order exists.

**Fix:** derive card count from the round schedule (cards are `1..R` where `R` = number of pick rounds), and define an explicit pick-order source for swap rounds (reuse round 1's order, reverse the final round's order, or run a dedicated tiebreak-token order).

### Critical issue 2 — ties are mathematically guaranteed above 6 players

With P players each holding the values 1–6, if P > 6 then by pigeonhole **at least two players must play the same value every single round**. At the stated upper default of 8 players, every round has ties, and the tiebreak rule silently becomes the dominant ordering mechanism. There is currently no tiebreak rule at all.

Note El Grande's elegant answer: **"a player may not play a Power card bearing the value of a Power card that was already played in the same round."** That eliminates ties completely — but it only works when P ≤ card count, i.e. P ≤ 6 here.

**Tiebreak options with precedent, ranked:**
1. **Passing priority token** — the player who loses a tie holds a token that wins the next tie. Self-correcting, deterministic, auditable on a shared screen. Standard board-game solution.
2. **Worst cumulative pick position so far wins** — compensating, deterministic, and needs no extra UI state.
3. **Reverse of the previous round's finishing order** — BGG's "closest to start player" family.
4. **Random** — worst choice here. Unsatisfying and unauditable when everyone is staring at one screen and cannot verify the roll.

### Critical issue 3 — the final round has no decision

After round R−1 every player has exactly one card left, so the final round's order is fully determined and involves no choice. The card-play step for the last round should be auto-resolved (and arguably the resulting final-round order should be displayed as soon as it becomes locked, which is a nice moment of tension in itself).

Corollary: the mechanic offers R−1 real decisions, not R.

### Critical issue 4 — simultaneous reveal is the blind-ban problem again, every round

The spec identifies blind bans as a hot-seat hidden-information problem, but **simultaneous card selection is exactly the same problem repeated 5 more times**. This is the sleeper risk in the design. The 7 Wonders app shipped with **no pass-and-play mode at all** specifically because simultaneous selection does not work on a single device.

**Strong recommendation: default to El Grande's open sequential card play, not Libertalia's simultaneous reveal.**
- Players play cards face-up in a rotating order; later players see what has been played.
- With P ≤ 6, add El Grande's no-duplicate-value rule and ties disappear entirely.
- No device passing, no hidden state, no five extra reveal ceremonies, and the tension is arguably richer (a real "do I burn my 1 now that Alice took 2?" decision).
- Offer simultaneous reveal as an option only if a device-passing flow already exists for bans.

### Other UX requirements the mechanic implies

- **Show every player's remaining cards at all times.** Open information in both El Grande and Libertalia; without it the decision is unplayable.
- **Show the full round schedule before any card is played.** This is essential and currently unstated. If round 3 is a Mega-only round, whether to spend your 1 there is *the* decision the mechanic exists to create. Hiding the schedule turns a strategic mechanic into a coin flip. This is a hard dependency of the priority-card feature on the round-structure feature.
- **Small player counts:** at 2–3 players the mechanic is thin but harmless. Warn (do not block) above 6 players that ties will occur every round and explain the tiebreak rule.
- **Mega Evolution can only be used once per battle in Champions.** So drafting 2+ Megas buys flexibility, not power stacking. Surface this as a hint when the host sets the Mega requirement, or hosts will over-configure Mega rounds.

---

## Rule Systems in the Wild — Coverage Map

What real Pokémon draft leagues use, and whether the current design addresses it.

| Real-world mechanism | Prevalence | Design coverage | Assessment |
|---|---|---|---|
| **Snake draft order** | Near-universal (Smogon guide, Frost, pkmnDiscordBot, all fantasy tools). DRAFTNIGHT also offers linear and 3RR | Replaced by priority cards | Deliberate and defensible. **Consider offering plain snake as a fallback order mode** — it is 20 lines of code, it is what everyone already understands, and it is the graceful degradation if priority cards prove fiddly |
| **Points budget** (90 pts / 8 mons; 400 pts / 11 mons) | The dominant balancing system | Not present | See anti-features. Conscious rejection, but the author should be able to answer "what stops the first picker taking the single best Pokémon?" The honest answer is: bans, plus priority-card compensation over 6 rounds |
| **Tier slots** ("draft 3 OU, 3 UU, 3 RU, 3 NU") | Older but still live (Frost's mandatory tier slots) | Round structure is a strictly better version of this idea | Design is ahead of the field here |
| **Auction draft** | Common in fantasy, rarer in Pokémon | Not present | Correctly excluded |
| **Banlists / complex bans** | Universal. Champions Draft Kickoff bans Last Respects, Shed Tail, Moody, all sleep moves. Smogon spreadsheets store complex bans as **cell notes** | Species-level bans covered in 3 modes | **Gap: only species bans exist.** Real leagues need move/ability/item bans. But those are unenforceable in a species-only drafter and belong in a free-text "house rules" note. **Recommend a simple host-authored rules-notes field displayed on the tournament page** — DraftDex ships exactly this ("clear ruleset display") and it is nearly free |
| **Mega restrictions** | Live and varied: "only 1 Mega per team", "up to 2 Megas costing ≤22 points", "no limit in VGC", "Mega Lucario Z and Mega Garchomp Z excluded" | Mega rounds + Mega-ban list | Well covered and correctly targeted at Champions |
| **Tera restrictions / Tera Tax** | Major in SV draft leagues (per-Pokémon Tera pricing in Smogon templates) | Not present | **Correctly absent — Champions has no Terastallization** (confirmed via Victory Road regulations and ChampDex). Do not build it |
| **Free agency** (drop one, pick up an undrafted Pokémon; 3–5 per season; commissioner-set limits and deadlines) | Universal in season leagues | Swap budget + swap rounds | Well covered, and mid-draft swap currency is a novel improvement |
| **Player-to-player trades** | Common in leagues | Not present | Correctly excluded for a one-night event |
| **Draft more than you battle with** (draft 8–11, bring 6; Smogon: "almost no draft leagues draft exactly that number") | Universal in leagues | Draft exactly 6 | **This is the one place to think twice, but the design is probably right.** Champions is doubles with **"bring 6, pick 4"** — so a 6-Pokémon team is exactly a legal Champions team. Leagues draft extras because they play many opponents over a season and want per-matchup flexibility. For a single-evening tournament with a fixed team, 6 is correct and faster. Note it as a conscious divergence, not an oversight |
| **Pick timers with skip/halving** | Universal in async leagues | Not present | Correctly absent for hot-seat |
| **Standings: W/L + differential + head-to-head** | Universal (IPF: KO diff → KOs for → H2H → playoff match) | W/L only | **Gap. Capture one integer per match** |
| **Top-N cut to playoffs** | Universal | RR and SE exist separately | **Gap: no seeding/cut path between them** |

---

## Gaps in Current Requirements — Explicit List

Ordered by severity. These are the things real draft tools consider essential that the current Active list does not cover.

**P1 — the tool feels broken or breaks without these**

1. **Undo / edit a pick.** Universal in every commissioner-driven tool. Architectural: must be designed in from the first line of state code.
2. **Pool search by name.** Non-negotiable at 100+ pool entries.
3. **Pool filter by type / Mega-capable, composing with the round's restriction.**
4. **Draft board view (players × rounds grid) doubling as pick history.**
5. **Live per-player roster panels during the draft**, not just at the end.
6. **Priority card count must derive from round count**, not be fixed at 6. Current spec is internally contradictory once round structure is host-tunable.
7. **A stated tiebreak rule for equal priority cards.** Ties are guaranteed above 6 players.
8. **A defined pick order for post-draft swap rounds** (all cards are spent by then).
9. **The full round schedule must be visible before the first card is played**, or the priority-card decision is uninformed.
10. **Duplicate-ban resolution rule for blind mode**, since it changes the pool size.

**P2 — expected, cheap, and load-bearing for the tournament half**

11. **One numeric result field per match** (Pokémon remaining / KO differential) → enables the standard tiebreaker.
12. **Standings tiebreak chain**: record → differential → head-to-head.
13. **Seeded top-N cut from round robin into the bracket.**
14. **Initial player-order randomizer** (needed for snake-ban order, tiebreak seeding, and "who sits where").
15. **Regulation-set label on the roster snapshot**, and ideally host selection between snapshotted sets. Champions legality is versioned (M-A, M-B, ...) and rotates roughly every two months.
16. **Free-text house-rules / notes field** shown on the tournament page — real leagues always have rules that a species-only drafter cannot enforce.
17. **Explicit shared-screen legibility target** for the pool and board.

**P3 — nice, cheap, defer freely**

18. Shareable draft summary (plain text or image) for pasting into Discord.
19. Pick announcement flourish (sprite + name reveal), skippable.
20. Type-coverage panel per completed team.
21. Plain snake order as a fallback pick-order mode.

---

## Feature Dependencies

```
Roster snapshot (species, types, stats, Mega-capable, regulation label)
    └──required by──> Ban resolution
                          └──required by──> Pool build (+ auto-sizing)
                                                └──required by──> Round schedule compiler
                                                                      ├──required by──> Priority cards (card count = round count)
                                                                      │                     └──requires──> Round schedule VISIBLE up front
                                                                      │                     └──requires──> Tiebreak rule
                                                                      └──required by──> Draft loop
                                                                                            ├──requires──> Pool search + filter
                                                                                            ├──requires──> Draft board / pick history
                                                                                            └──requires──> Live rosters

Serializable single-object state
    └──required by──> Autosave / resume
    └──required by──> JSON export / import
    └──required by──> UNDO  ← must exist before the draft loop is written

Blind ban mode ──requires──> Hidden-information flow (pass-device / look-away / paste)
Blind ban mode ──requires──> Duplicate-ban policy ──affects──> Pool auto-sizing

Match results (+ differential field)
    └──required by──> Standings
                          └──required by──> Seeded cut
                                                └──required by──> Bracket

Roster snapshot ──required by──> Export (species names must match Showdown/pokebase naming exactly)

Swap rounds ──requires──> A pick-order source that survives all cards being spent
Simultaneous card reveal ──conflicts with──> Single shared screen
Hard pick timer ──conflicts with──> Hot-seat voice-call pacing
Points/cost system ──conflicts with──> Round-structure-as-constraint design
```

### Dependency Notes

- **Undo must precede the draft loop.** Every surveyed commissioner tool has it. Retrofitting undo onto mutable state is the classic rewrite trigger. Model state as an append-only pick log or a snapshot stack from the start.
- **Priority cards depend on the round schedule twice** — for card count, and for the schedule being visible so the decision is informed. These cannot be built in separate phases without one blocking the other.
- **Duplicate-ban policy feeds pool auto-sizing.** If duplicates collapse, fewer Pokémon are removed and the pool math shifts.
- **Export depends on exact species naming.** Showdown's paste format is well known; pokebase.app's needs verification, and Champions' own "replica team" 10-character codes are a separate thing entirely (likely not client-generatable — treat as out of scope unless proven otherwise).
- **Simultaneous card reveal conflicts with the single screen.** Resolve by choosing open sequential play, or by reusing the blind-ban device-passing flow.

---

## MVP Definition

### Launch With (v1)

- [ ] Tournament config: players, names, format label, rule set — the entry point for everything
- [ ] Host-mode banlist **and** snake-mode bans — both work perfectly on a shared screen with zero hidden-information machinery
- [ ] Pool build with auto-sizing and host override
- [ ] Round schedule compiler incl. Mega rounds, **displayed in full before drafting begins**
- [ ] Pick order: priority cards, **open sequential play**, card count derived from round count, explicit tiebreak rule, remaining cards always visible
- [ ] Draft loop with **name search + type filter**, density toggle, immediate pool removal
- [ ] **Draft board grid + live per-player rosters + clear on-the-clock indicator**
- [ ] **Undo last pick** (and undo card play)
- [ ] Swap budget as mid-draft currency
- [ ] Species-only export per player, Showdown-format verified
- [ ] Autosave to browser storage + JSON export/import
- [ ] Committed Champions roster snapshot with Mega-capability flags and a regulation label

### Add After Validation (v1.x)

- [ ] **Blind ban mode with a real pass-device flow** — trigger: v1 shipped and the group asks for it. Highest UX risk; do not let it block v1
- [ ] Post-draft swap rounds — trigger: mid-draft swap currency proves insufficient
- [ ] Round robin + standings with differential tiebreak — trigger: first group that wants a full tournament night
- [ ] Single elim bracket with byes + seeded cut from standings — trigger: same
- [ ] Best-of-three match config and match log
- [ ] In-app roster refresh — trigger: first regulation-set rotation after launch
- [ ] House-rules free-text field
- [ ] Player-order randomizer

### Future Consideration (v2+)

- [ ] Type-coverage panel — defer: pure polish, and it is the closest thing to the teambuilder line; build it only with a firm no-movesets rule
- [ ] Second-device ban submission via short code — defer: elegant but the pass-device flow must prove insufficient first
- [ ] Shareable draft summary image — defer: screenshots already work
- [ ] Pick announcement flourish — defer: pure delight
- [ ] Plain snake as an alternate pick-order mode — defer: only if priority cards disappoint in practice
- [ ] Cross-device sync — defer: explicitly out of scope; the serializable-state decision keeps the door open

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Undo / edit pick | HIGH | LOW (if designed in) / HIGH (if retrofitted) | **P1** |
| Pool search by name | HIGH | LOW | **P1** |
| Pool filter by type / Mega | HIGH | LOW | **P1** |
| Draft board grid + pick history | HIGH | MEDIUM | **P1** |
| Live per-player rosters | HIGH | LOW | **P1** |
| Round schedule compiler | HIGH | MEDIUM–HIGH | **P1** |
| Round schedule visible before card play | HIGH | LOW | **P1** |
| Priority cards, open sequential + tiebreak | HIGH | MEDIUM | **P1** |
| Card count derived from round count | HIGH | LOW | **P1** |
| Autosave / resume | HIGH | MEDIUM | **P1** |
| Species-only export | HIGH | LOW | **P1** |
| Roster snapshot + Mega flags + regulation label | HIGH | MEDIUM | **P1** |
| Host + snake ban modes | MEDIUM | LOW | **P1** |
| On-the-clock / up-next indicators | MEDIUM | LOW | **P1** |
| Mid-draft swap currency | MEDIUM | MEDIUM | **P1** |
| JSON export / import | MEDIUM | LOW | P2 |
| Blind ban with pass-device flow | HIGH | MEDIUM–HIGH | P2 |
| Round robin + standings | MEDIUM | MEDIUM | P2 |
| Differential field + tiebreak chain | MEDIUM | LOW | P2 |
| Single elim + byes + seeded cut | MEDIUM | MEDIUM–HIGH | P2 |
| Best-of-three config | LOW | LOW | P2 |
| In-app roster refresh | MEDIUM | MEDIUM | P2 |
| House-rules notes field | MEDIUM | LOW | P2 |
| Post-draft swap rounds | MEDIUM | MEDIUM | P2 |
| Player-order randomizer | LOW | LOW | P2 |
| Type-coverage panel | MEDIUM | MEDIUM | P3 |
| Second-device ban codes | MEDIUM | HIGH | P3 |
| Pick announcement flourish | LOW | LOW | P3 |
| Shareable draft summary | LOW | LOW | P3 |
| Points/cost system | LOW (here) | HIGH (maintenance) | **Do not build** |
| Auction mode | LOW | HIGH | **Do not build** |
| Hard pick timer with auto-skip | NEGATIVE | MEDIUM | **Do not build** |
| Autodraft / recommendations | NEGATIVE | MEDIUM | **Do not build** |
| Double elim / Swiss | LOW | HIGH | **Do not build** |
| Trades | LOW | HIGH | **Do not build** |

---

## Competitor Feature Analysis

| Feature | DraftDex (hosted, Pokémon) | FanDraft / Commish Kit (hosted, generic, one-screen) | Smogon Google Sheet (the real incumbent) | Our Approach |
|---|---|---|---|---|
| Pick order | Snake or linear, timer | Snake/linear/3RR, pick clock | Manual, snake by convention | **Priority cards** — novel; open sequential play |
| Balancing | Points budget | N/A | Points or tier slots, hand-maintained | **Round structure** — invalid teams unrepresentable |
| Bans | Custom draft-pool editor | N/A | Cell notes on the sheet | 3 modes incl. **blind bans**, which nobody else has |
| Multiplayer | Real-time, accounts | Commissioner mode on one laptop + remote owners | Everyone edits the sheet | **Hot-seat only** — no accounts, no server |
| Undo | (not advertised) | "Edit selections" / "fix mistakes" / "Draft Rewind" | Ctrl-Z | **Must have it.** Currently missing from requirements |
| Search / filter | Type + name, Pokédex profiles | Autocomplete player search | Ctrl-F | Name search + type/Mega filters composing with round restrictions |
| Free agency | Pickup limits, budgets, deadlines | N/A | Manual, 3–5 per season | **Swaps** as mid-draft currency + optional swap rounds |
| Brackets | Auto SE/DE, byes, consolation | N/A | Manual or Challonge | RR + SE + byes, host-selectable depth. **No DE, no Swiss** |
| Standings | W/L, KO counts | N/A | Formulas, differential tiebreak | W/L + differential + H2H |
| Data | Live, maintained service | Live player feeds | Hand-curated per season | **Committed snapshot + optional refresh**, regulation-labelled |
| Cost / friction | Signup required | $25–45/season (DRAFTNIGHT) | Free but hand-built | **Free, no install, no account, offline** |
| Format | SV / NatDex / VGC | Real sports | Any Smogon gen | **Champions only**, versioned by regulation set |

---

## Champions-Specific Findings That Affect Features

Confirmed across [Victory Road](https://victoryroad.pro/champions-regulations/), [ChampDex](https://champdex.com/guides/format-rules) and [Bulbapedia](https://bulbapedia.bulbagarden.net/wiki/Regulation_Set_M-B):

- **Doubles only, "bring 6 pick 4."** A 6-Pokémon draft is exactly a legal Champions team — this validates the "team of six" decision. Note that Smogon separately runs a `[Champions] Draft` **singles** tier on Showdown, which justifies keeping the singles/doubles format label.
- **Mega Evolution is in; Terastallization and Dynamax are not.** Build Mega rounds; do not build anything Tera-related, including Tera Tax pricing that SV draft spreadsheets require.
- **Mega Evolution can only be used once per battle.** Multiple Megas on a team = flexibility, not stacking. Surface this when the host configures Mega rounds.
- **There is no separate Champions banlist — legality *is* the current regulation roster.** "No banned Pokémon, so if a Pokémon is in the game, it can be used." This makes "Champions-legal" a crisp, checkable claim and simplifies the data model considerably.
- **Regulation sets rotate roughly every two months** (M-A: Apr 8 – Jun 17 2026; M-B: Jun 17 – Sep 2 2026, 284 base species, +22 species and +13 Mega options over M-A, including Champions-exclusive Mega Raichu X/Y). The snapshot must be labelled with its regulation set, and the refresh path is not optional polish — it is required for the tool to stay correct.
- **Champions uses 66 Stat Points (max 32 per stat) instead of EVs, and perfect IVs by default.** Another concrete reason not to build a teambuilder: it is a different stat model from Showdown's, and ChampDex already implements it.
- Open question for the export dimension: Champions has its own **10-character "replica team" codes**. Worth confirming whether these are client-generatable before assuming a Showdown paste is the only export target.

---

## Sources

**Pokémon draft league domain**
- [Beginner's Guide to Draft League (Smogon)](https://www.smogon.com/articles/beginners-guide-draft) — HIGH
- [Beginner's Guide to Draft League Vol. 2 (Smogon)](https://www.smogon.com/articles/beginners-guide-draft-2) — HIGH
- [Draft League Resources (Smogon)](https://www.smogon.com/forums/threads/draft-league-resources.3716128/) — HIGH
- [Champions Draft Kickoff — Battle Pools (Smogon)](https://www.smogon.com/forums/threads/champions-draft-kickoff-battle-pools.3781441/) — HIGH
- [Frost Draft League rules](https://frostpokemondraftleague.weebly.com/rules.html) — MEDIUM
- [Independent Pokebattling Federation draft rules](https://independent-pokebattling-federation.fandom.com/wiki/Draft_League_Rules) — MEDIUM
- [ARK's Pokémon Draft League rules](https://arkspokemondraftleague.weebly.com/rules.html) — MEDIUM
- [Starting A Pokémon Draft League (ScreenRant)](https://screenrant.com/starting-pokemon-draft-league-rules-tips/) — LOW

**Pokémon Champions format**
- [Pokémon Champions Regulations (Victory Road)](https://victoryroad.pro/champions-regulations/) — HIGH
- [ChampDex format rules](https://champdex.com/guides/format-rules) — MEDIUM-HIGH
- [Regulation Set M-B (Bulbapedia)](https://bulbapedia.bulbagarden.net/wiki/Regulation_Set_M-B) — HIGH
- [Regulation M-B roster (Game8)](https://game8.co/games/Pokemon-Champions/archives/605482) — MEDIUM

**Draft tools**
- [DraftDex](https://draftdex.net/), [Drafty Sports](https://draftysports.com/pokemon), [randompokemon.co generator](https://www.randompokemon.co/draft-league-generator) — MEDIUM (vendor pages)
- [FanDraft how-it-works](https://www.fandraft.com/how-it-works/), [FanDraft in-person](https://fandraft.com/in-person-drafts), [FanDraft (Wikipedia)](https://en.wikipedia.org/wiki/FanDraft) — MEDIUM-HIGH
- [Clicky Draft](https://clickydraft.com/), [DRAFTNIGHT.tv](https://draftnight.tv/), [Commish Kit](https://commishkit.com/product/digital-fantasy-football-draft-board-kit/) — MEDIUM
- [HootDraft (OSS)](https://github.com/mattheworres/hootdraft), [PHP Draft (OSS)](https://github.com/Justinomics/phpdraft), [pkmnDiscordBot](https://github.com/lancersimmons/pkmnDiscordBot), [PorygonBot](https://github.com/PorygonBot/bot-ts) — HIGH (source repos)
- [theDraftNight reviews](https://apps.apple.com/us/app/id1017177870) — MEDIUM (user reviews)

**Tournament management**
- [Challonge competition formats](https://kb.challonge.com/en/article/learn-about-challonge-competition-formats-1f8j1cf/) — HIGH
- [All About Scripted Tournaments (Smogon/PS)](https://www.smogon.com/player/issue2/all-about-scripted-tournaments) — HIGH
- [Round Robin vs Single Elimination](https://www.scorekeeper.co/blog/round-robin-vs-single-elimination) — MEDIUM

**Mechanics precedent**
- [El Grande rules (UltraBoardGames)](https://www.ultraboardgames.com/el-grande/game-rules.php), [El Grande power cards (BGG)](https://boardgamegeek.com/blogpost/63046/el-grande-power-cards) — HIGH
- [Libertalia rules (UltraBoardGames)](https://www.ultraboardgames.com/libertalia/game-rules.php) — HIGH
- [BGG: Auction — Sealed Bid](https://boardgamegeek.com/boardgamemechanic/2920/auction-sealed-bid), [BGG: Simultaneous Action Selection](https://boardgamegeek.com/boardgamemechanic/2020/simultaneous-action-selection) — HIGH
- [7 Wonders app review (no pass-and-play)](https://www.pixelatedcardboard.com/7-wonders-review/) — MEDIUM

**Hot-seat / hidden information**
- [LoL Team Drafting wiki (blind ban phase)](https://wiki.leagueoflegends.com/en-us/Team_drafting), [Riot /dev: On Launching 10 Bans](https://nexus.leagueoflegends.com/en-us/2017/05/dev-10-bans-arrives/) — HIGH
- [Hotseat (Wikipedia)](https://en.wikipedia.org/wiki/Hotseat_(multiplayer_mode)), [Tabletopia hidden areas](https://help.tabletopia.com/knowledge-base/hidden-areas-for-players/) — MEDIUM
- Pass-and-play party apps: [Spy](https://playspy.app/), [Imposter Party](https://apps.apple.com/us/app/imposter-party-games/id1562982547), [Werewolf Master](https://play.google.com/store/apps/details?id=com.EnesSorucu.werewolf) — MEDIUM
- [Airgapped QR code transfer (OSS)](https://github.com/mohankumarelec/airgapped-qr-code-transfer) — HIGH

**Confidence caveats:** The priority-card edge-case analysis (guaranteed ties above 6 players, the forced final round, the card-count/round-count contradiction) is my own reasoning applied to the stated design, not a cited source — but the underlying rules of El Grande and Libertalia are verified. Draft-tool complaint evidence is thinner than I would like: I found app-store reviews and Smogon forum quotes, not a systematic body of user research.

---
*Feature research for: Pokémon draft-tournament tooling (hot-seat, single-screen, static site)*
*Researched: 2026-08-03*
