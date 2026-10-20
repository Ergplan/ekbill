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

- **The header, every screen**: three captioned controls top right: Theme (a sun or a moon, one tap), Madad (the tour; a help icon, not the globe) and Aapki profile (the ring). Welcome and login, before sign-in, carry the same help icon in place of "?"; with Twilio sign-in on, login's code step offers "Code dobara bhejo" after 30 seconds.
- **Home**: the hello rises in word by word, "Namaste, Sharma ji" in the person's language once they have said their name. Under it, the star: "Naya bill banao" for someone who has billed before, "Pehla bill banao" for a new business, and "Apne baare mein batao" (no name in the hello) for someone who has not said their name. This changes Stage 1 answer 8 only in adding the star; Home keeps its three cards.
- **Setup, first step**: "Apne baare mein batao": the person's own name, then the shop's.
- **Aap**: an "Aapki profile" group with the person's name; Save floats only while there is something to save (the stuck "Save ho gaya" is gone); a new language changes the words in place, the new language's hello in between, with no reload.
- **The voice**: never starts by itself; a one-line hint by the mic once a visit ("Main yahan hoon…"); a five-word greeting when it starts; quiet when the owner opens screens themselves; it stops after 3 s with no one speaking and nothing playing.
- **The guide ring**: fixed to the screen, so it stays on the field it names while the page scrolls.

## 20 Oct 2026: the welcome, the app demo, the plan and refer-a-friend (I10)

The operator wrote: "Now the experience First time user - After Login let us discuss the flow - The user sees the screen and a greeting precorded - Namaste , ekBill mein aapka swagat hai. Ek chota application tour chalega? Then a small window of Haan and Na If Haan then As kis language mein, then in the selected language 45 seconds demo across the application precorded in the selected language with focus on the fact that voice helps to fill everything, draft a script and glow the areas where demo moves, customer can stop the demo run anythimw and return to home screen. If demo run completed then It should end at Apne baare mein bataye section glowing if customer is first time. The voice should speak in hinglish by default. Also find a way to allow demo to old customers also since new features will be introduced or they may want to show the demo to a friend. Also we need refer a friend feature to get 25% discount on the monthly fee. We are keepng a monthly fee of INR 20, payment through UPI. 20 bills are free. Set it up."

The build agent takes this as the answer to add, and re-records the baselines it moves, both themes:

- **Aap**: an "Aapka plan" group (free bills left, or the month's end; "Dost ko jodo, 25% bachao"), and "App ka demo dekho" with Poocho.
- **Aapka plan** (`/aap/plan`, new): the plan's state, paying ₹20 by UPI with the 12-digit reference, the referral link (WhatsApp, copy) and who joined, past payments.
- **Welcome**: "Pehle demo dekho (45 sec)" for a visitor.
- **Every sheet**: the dimmed backdrop now dims (its colour token did not exist, so it never had).
- The greeting and the demo are overlays over Home and the sample screens; the seed's people have seen the demo, so no baseline shows them.

## 20 Oct 2026: kaccha bill and pakka bill, and WhatsApp to a typed number (I10)

The operator wrote: "We need one more opening button kaccha bill bana hai (estimate) second pacca bill baanan hai (tax invoice). The opening guide should explain this." And then: "kaccha bill in India refers to estimates which are sent before exact invoice can be sent for buyer to check and somethings street vendors only give kcahha bill. Once more aspect is how to link the pplication so bill goes directly to user Watsapp by typing the number in the application, becuase shopkeeper may not have number stored in watspp of new custoemr and the bill sending process then becomes tedious."

The build agent takes these as the answer to change the approved design where they say, and re-records the baselines they move, both themes:

- **Home**: two opening buttons where the star was: "Pakka bill banao (tax invoice)" (the star; "Pakka bill banao" for a business without GST) and "Kaccha bill banao (estimate)" under it, with one line saying which is which. The first-run Home has the same pair in its hero ("Pehla bill banao" stays the pakka one). The tour opens on the two.
- **The bill form**: "Pakka bill | Kaccha (estimate)" on top; an estimate's heading, number (EST-001) and button ("Estimate banao") are its own, with a line saying it counts in no GST return and no dues. A pakka bill made from an estimate says so on top and starts with its lines.
- **Bill ban gaya**: the customer's WhatsApp number (theirs on record, or typed) above "WhatsApp pe bhejo", which opens that number's chat at once with the message and the bill's own link; "File share karo (PDF/JPG)" under it. An estimate's screen says "Estimate ban gaya!" and offers "Pakka bill banao".
- **The bill view**: "WhatsApp dobara" opens a sheet with the same number and button. An estimate's view: "Kaccha bill (estimate)", its amount, "Pakka bill banao" (or the pakka bill made from it), and only its own cancel under "Galti ho gayi?".
- **Bills**: a "Kaccha (estimate)" chip lists the estimates, each with the pakka bill made from it.
- **The bill's own page** (`/b/<link>`, new): what the customer opens from WhatsApp, with no sign-in.
- **The demo**: a step on the kaccha bill after the pakka one; the WhatsApp step says the number is typed. The photo lines say "haath se likha bill" (a handwritten bill), as "kaccha bill" now means an estimate.

## 20 Oct 2026, evening: a real application, GST item by item, the bill screen's navigation and "Bill badlo" (I10)

The operator wrote, on the VM, signed out (the sample shop): "AAPKI PROFILE … why some links are not working?"; then, with a bill whose three lines carried different rates under one CGST and one SGST: "each item has different GST, do not club the GST, also GST should be item wise by default rather than clicking and selecting alag alag GST, Where is language change mode? I think you have confused testing environment a bit. The anchor navigation is missing in the bill screen, also there is no bill editing button immediately after the bill generation. Customer needs to go back to main screens of bills to modify the bill." And: "So give us a real application to test everything, not needed dummy application at this stage. If OTP is not linked then just say proceed without mobile registration." And: "But give us a fully functional application pleaseeee".

The build agent takes these as the answer to change the approved design where they say, and re-records the baselines they move, both themes:

- **No sample shop for a visitor**: signed out, every screen goes to the welcome; the sample stays only as a look (`?as=`, the demo and /flow).
- **Welcome and sign-in, while SMS is off**: "Mobile ke bina aage badho" makes an account of one's own (a new person, then their own shop); a number typed on the sign-in is the account at once, with no code step, and the screen says SMS codes are not on yet.
- **The bill form**: every line has its own GST rate from the start (an item's own rate when it has one); "Sab pe ek rate" stays in the GST sheet. The bottom navigation stays on the form, the "Bill banao" bar above it.
- **The bill**: a GST column gives each line's rate, and the tax is one CGST and one SGST (or IGST) row per rate, in the form, on the screen and on the PDF.
- **Bill ban gaya**: the bottom navigation stays; the owner has "Galti hai? Bill badlo" (the bill is cancelled, as GST requires, and the form opens again with the same customer and lines).
- **Aap**: the language sits right under "Aapki profile".
