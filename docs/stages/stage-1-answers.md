# Stage 1 — the operator's answers

On 15 Oct 2026 the operator wrote "continue build for next 12 hours" after the round-3 reviews, without a separate "— APPROVED" line. The build agent takes that as the go-ahead past the Stage 1 gate on the proposals below (each is the proposal the report made); the operator can overturn any of them in a later stage with "Run Stage 1 again" and the changed answer.

| #   | Question                                                              | Answer                                                               |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Short setup path; PAN/UPI/city/signature on the review screen and Aap | Accepted; the signature is asked again before the first bill is sent |
| 2   | First bill carries the name inline; "Naya customer" keeps its screen  | Keep both                                                            |
| 3   | Kitna defaults to 1                                                   | Keep                                                                 |
| 4   | Inactive tabs show their icon only                                    | Keep                                                                 |
| 5   | Harmony's Home shows two folders                                      | Keep, with the peeks                                                 |
| 6   | GST rate chips from the rule pack by date, unverified until Stage 3   | Keep; Stage 3 verifies                                               |
| 7   | Accountant: Download yes, WhatsApp dobara no                          | As proposed                                                          |
| 8   | Poocho and the contract helper reached from Aap, not Home             | Keep Home to three cards                                             |

Baselines: `tests/e2e/__screenshots__` and `design/screens/<theme>/v2-*.png` as of the round-4 commit are the approved screens (I10); later stages change the data behind them, never the design.

## 16 Oct 2026: two baselines re-recorded (I10)

The operator walked the live app and sent screenshots of two defects that were in the approved screens themselves; asked whether to fix them, the screenshots were the answer. Re-recorded, both themes, with no other change:

- **Home** (and its staff, accountant and composition states): the "Bheje hue bills" count used classes with no style, so the figure and its words ran together ("03bills gaye is mahine"). The figure is now the pack's figure size with the words beside it.
- **The switcher** (`/dev/switch`): the list cancelled the card's padding, so avatars and role pills touched the card's edges. The rows now sit inside the card.

## 17 Oct 2026: the alignment pass and five languages (I10)

The operator wrote: "Keep building. Will do final review after full application development. The screens are good but text alignment please check everywhere. We need hindi, marathi, and tamil version also, both text and voice." The build agent takes "text alignment please check everywhere" as the answer to re-record the baselines the pass changes, both themes, with no other change to the design:

- **Lists on a card** (Bills, Paise aane hain, Customers, Items, Team, the import's rows, the GST drill-down, the bill's Paison ka hisaab): `eb-rows` on the card itself cancelled the card's padding (the switcher's defect of 16 Oct, everywhere else), so avatars and amounts touched the card's edges. The rows now keep the card's side inset; the first row has no rule above it.
- **Paise aane hain**: Yaad dilao and Paise aa gaye start under the name, not under the avatar; one rule between customers, not two.
- **The bill form**: the customer's name field leaves the header the room a heading does; a line's Rakam sits on the line of Kitna and Rate (it was lower); "KAAM 01" comes from the dictionary.
- **Bills**: the series chips (INV-, AMC-) were a pill inside a pill; one pill now.
- **GST**: the hero's two tiles inherited the hero's light text on their white surface (Narangi showed the icons and no figures); a long amount shrinks to its tile.
- **Customers**: only "Naya customer" floats; "Purane bills upload karo" sits after the list (floating under the main button let the list show between the two).
- **Aap**: the logo and signature thumbnails are a row's height; "Logo hatao" is a row of its own words.
- **Hindi, Marathi, Tamil**: no letter-spacing (it pulls vowel signs apart) and taller lines for headings.

## 19 Oct 2026: the operator's walk of the live app (I10)

The operator wrote, with two screenshots (the guide ring below "Customer ka naam" on the bill form; the header's globe and profile ring): "Voice Starts on its own ramdomly. check alignment. The voice experince is not so good when customer clicks screens very fast while the voice is talking. I think the Naya bill button should the star when opening the page after login for old users and apne baare mein batao for new customers. The voice should speak less like on login, mein yahan hoon agar aapko koi help chayiye then ye botton click karo aur mujhse baat karo. After that the conversation starts. 3 seconds of no response auto shuts the voice to save tokens. Add lables like Apki profile and do not know what the global map does. Cllick on language change is very bad. It sohuld be like a animation where the words tansform into the selected lanyage, theatrics. Save profile is stuck. Color modes should be on top right. Also there should be greeting on start like animation Namaste Sharmaji or which ever language they have selected." And then: "'Apne baare mein batao' for new ones, with an animated greeting ('Namaste Sharma ji' in their language). The app will not know the name of the user until they fill it. So Namaste Sharma ji is for users after sign up."

The build agent takes these as the answer to change the approved design where they say, and re-records the baselines they move, both themes:

- **The header, every screen**: three captioned controls top right: Theme (a sun or a moon, one tap), Madad (the tour; a help icon, not the globe) and Aapki profile (the ring).
- **Home**: the hello rises in word by word, "Namaste, Sharma ji" in the person's language once they have said their name. Under it, the star: "Naya bill banao" for someone who has billed before, "Pehla bill banao" for a new business, and "Apne baare mein batao" (no name in the hello) for someone who has not said their name. This changes Stage 1 answer 8 only in adding the star; Home keeps its three cards.
- **Setup, first step**: "Apne baare mein batao": the person's own name, then the shop's.
- **Aap**: an "Aapki profile" group with the person's name; Save floats only while there is something to save (the stuck "Save ho gaya" is gone); a new language changes the words in place, the new language's hello in between, with no reload.
- **The voice**: never starts by itself; a one-line hint by the mic once a visit ("Main yahan hoon…"); a five-word greeting when it starts; quiet when the owner opens screens themselves; it stops after 3 s with no one speaking and nothing playing.
- **The guide ring**: fixed to the screen, so it stays on the field it names while the page scrolls.
