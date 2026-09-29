# execute.cash

Execute's website: the landing page, plus the app on top of [execute-server](../execute-server) (the
Execute API):

- a sign-in;
- a developer dashboard;
- a public page for every executable address.

Next.js 16 (App Router), React 19, Tailwind v4, three.js for the story's scene, Privy for sign-in, and
viem for checking addresses.

```sh
pnpm install
cp .env.example .env.local   # Privy app id; EXECUTE_API_URL=http://127.0.0.1:8090 for a local execute-server
pnpm dev                     # http://localhost:3000
pnpm build
```

The design of the API itself is in [design/api.md](design/api.md).

## The app

| Route | What |
|---|---|
| `/login` | Privy email sign-in. Redirects to `?next=`, `/dashboard` by default. |
| `/dashboard` | One page, gated on the client (`components/app/dashboard.tsx`). |
| `/address/[address]` | Any executable address, as a wallet would show it (`components/app/address-view.tsx`). |
| `/api/execute/[...path]` | Allowlisted same-origin proxy to execute-server. |

Each part works as follows:

- **Sign-in and dashboard** sit in the `app/(app)` route group, under Privy and React Query
  (`components/app/providers.tsx`). The landing page and address pages never load either.
- **The dashboard** manages the account's two credentials:
  - The **API key** is secret and for servers. It is shown once, when created or rotated.
  - The **client ID** is publishable and for web pages. The dashboard edits the list of allowed
    origins it works from, and shows the server's own correction of a non-canonical entry inline.
  - Destructive actions (rotating) ask for confirmation inline, never with a browser dialog.
- **The dashboard also manages** the webhook URL and its signing secret, and lists the account's
  addresses with their live status.
- **Its data layer** (`lib/execute/*`) takes its API client from `DashboardClientProvider`. The
  signed-in app provides it with Privy's access token.
- **The address page** fetches the address's intent, status and chains from execute-server on the
  server:
  - It shows what to send ("Send exactly 1,000.00 USDC on Base").
  - It shows each call with its arguments labelled (the amount, the token, recovery), and where the
    money goes if the calls cannot run.
  - It polls the status through the proxy.
  - The browser **recomputes the address from the intent** before showing "Checked in your browser"
    (`lib/execute/derive.ts`, viem, `Payment`'s creation code from `components/payment-creation-code.ts`).
    So the page does not take the API's word for what an address does. Only factories in
    `KNOWN_FACTORIES` are trusted.
- **The proxy** forwards a strict allowlist:
  - the account routes, with the Privy token passed through untouched;
  - the public status and chains routes.

  It never forwards the browser's `Origin`. execute-server sends no CORS headers on account routes,
  and refuses secret keys from browsers.
- **Navigation:** the landing page's "Get started" buttons lead to `/dashboard`, and the navbar has a
  "Sign in" link (hidden on phones, where the hero's button is right there).

Environment (see `.env.example`):

| Variable | |
|---|---|
| `NEXT_PUBLIC_PRIVY_APP_ID` | The Privy app. Its allowed domains must include this site's (and `localhost` for development). |
| `EXECUTE_API_URL` | execute-server, server-side only. Defaults to `https://api.execute.cash`. |
| `NEXT_PUBLIC_EXECUTE_API_URL` | The API URL shown in snippets. |

## The hero

"Never [Connect Wallet]", shared by both pages in `components/hero.tsx`.

- `/`: `components/flow-button.tsx`. One Aqua button that a cursor clicks through Connect Wallet, Approve tokens and Switch network, with "Confirm in wallet" after every click, forever. A small phase timeline drives it; all motion is CSS transitions (styles under "The flow button" in `app/globals.css`).
- `/morph` (not indexed): `components/morph-button.tsx`. The button morphs in place through eleven eras of UI design. Every visual property is a registered custom property (`@property --m-*`), so styles interpolate instead of snapping, and the Recursive label's axes morph too. `?style=<id>` pins a style (e.g. `/morph?style=aqua`).
- Both pause off-screen, respect reduced motion, and answer a click with "Nothing to connect. Just send." (`components/stage.tsx`).

## Wallet, App, Send (the section after the hero)

`components/story.tsx` pins for about ten screens while a rendered hardware scene plays three acts:

1. **Wallet** ("A wallet is a sandbox."). The wallet (matte black body, white face, glass display showing its balance) lifts its lid: inside, in a foam insert, a brass key and a USDC coin rise out, then settle back and it closes.
2. **App** ("Connecting to apps is a risk."). An app slides in and its Connect Wallet button is clicked. A plug flies across on its cable into the wallet's port, the lid is forced off, requests pulse in along the cable, and the coin is pulled out down it while the balance drains.
3. **Send** ("Send, don’t sign."). The wallet reseals. An executable address drops in, its black shell lifts off and its layers spread along a rail; a coin leaves the wallet's slot, passes through every layer's aperture (each lights green) and drops into the app.

- `components/story-scene.ts` is the choreography: a pure function from story progress (0 to 3.4) to where everything is, plus `PACE`, the table of how many screens of scrolling each beat gets. Retime the section there: holds get as much room as the motion around them.
- However hard the page is flicked, the scene plays no faster than about 1.4 screens of story a second (`PACE_LIMIT` in `story.tsx`), catching up faster only when far behind; the rail's jumps skip the limit.
- `components/story-stage.ts` draws it with three.js (loaded only when the section mounts): real materials, studio lighting, soft shadows on the page, and a long-lens camera that frames each act. Screens are canvas textures redrawn only when their content changes.
- Reduced motion shows each act as a still, rendered once. Without WebGL the copy still tells the story.

## What you see is what executes (the section after the story)

`components/verify.tsx` opens an executable address. There are three tabs, each a real 1,000 USDC deposit on Base: Morpho's Steakhouse Prime USDC vault, Spark Savings USDC (sUSDC) and Aave V3's USDC market. The navbar's Morpho, Spark and Aave links open their tab.

- **Real terms.** `components/verify-terms.ts` builds each deposit's calls (`approve`, then `deposit` or `supply`) and ABI-encodes the terms, keeping a map of which bytes carry which field. It then derives the address as `PaymentFactory` does, from `Payment`'s creation code in `components/payment-creation-code.ts`, using `@noble/hashes` for keccak. On 2026-09-28 the three addresses matched `paymentAddress` on Base, and each deposit settled on a Base fork with the shares landing with the user.
- **Filling in.** The raw terms run down the left. On the right, every field waits as a placeholder of its own kind and fills in as the section reaches it:
  - Amounts start at `0.00` and count up through rising figures. Each one lands on [torph](https://torph.lochie.me)'s roll of the one before, so the digits spin.
  - Hex (the salt and both addresses) spins in from zeros on slot reels that land left to right (`Reels`). torph rolls digits but fades letters, and hex is mostly letters.
  - Names and labels morph in from a dash.

  A field keeps one typeface throughout; only its colour changes, so the morphs stay smooth. Then the terms are hashed, and the result, recomputed in the browser, is held against the address the app showed.
- **The coin.** It's the story's USDC coin, rendered on its own by `components/coin-stage.ts`. It starts blank and spins into USDC once the token is read. A flat mark stands in until three.js loads, and without WebGL.
- **Pacing.** It plays while on screen and moves to the next tab after the verdict. With a mouse resting on the window, a finished tab waits.
- **Tampering.** Clicking any byte flips its lowest bit, and "Change one byte" does the same to the deposit's receiver. The changed field turns red and the address stops matching.
- **Every tab keeps the same height,** so nothing below it moves.
- **`YOU` is an example address.** No one holds its key. Before launch, set it to an address you control, and every address on the page is derived again from it. The story's app screen reads the Morpho address from here too.
- Reduced motion shows each tab's verdict, still.
- **The guide link.** Between the heading and the window, a link names Morpho, Spark and Aave with their logos and leads to the integration guide. Its target is `GUIDE_HREF` in `components/verify.tsx`, a placeholder (`#integration-guide`) until the guide is hosted.

`components/logo.tsx` is the mark traced from `execute-cash-logo.png` (paints in `currentColor`). Protocol logos are in `public/protocols`.
