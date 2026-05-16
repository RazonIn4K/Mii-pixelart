/**
 * /guides — Free guide index + long-form Tomodachi Life player guides.
 *
 * Top of the page: short teaser cards for the four recovery + studio guides.
 *   The CTA points at the matching free tool (studio, password check, help)
 *   and optionally upsells to /unlock or /support.
 *
 * Below: four full-length Tomodachi Life player guides, rendered inline so
 * Google indexes the actual content. Each guide has an anchor ID so it can
 * be deep-linked from elsewhere on the site or from external posts.
 *
 *   #mii-creation       — designing custom Miis
 *   #gameplay-basics    — apartments, food, jobs, marriage
 *   #breach-recovery    — what to do after the Tomodachishare incident
 *   #qr-and-backup      — QR codes, sharing, save backup
 */

import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Palette,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Users,
  Gamepad2,
  QrCode,
  ScanFace,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { breadcrumbFor } from "@/lib/breadcrumb";
import { useStructuredData } from "@/hooks/useStructuredData";

interface GuideCard {
  id: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  summary: string;
  audience: string;
  freePreview: string[];
  cta: { href: string; label: string };
  upsell?: { href: string; label: string };
}

const GUIDES: GuideCard[] = [
  {
    id: "tomodachi-breach-recovery",
    icon: AlertTriangle,
    title: "Tomodachi breach recovery checklist",
    summary:
      "What to do in the first 24 hours if your email was exposed in the Tomodachishare incident, plus a 30-day monitoring rhythm.",
    audience: "If you got a breach notice or reused passwords with the site.",
    freePreview: [
      "Free: the four most urgent actions to take today.",
      "Free: how to spot reuse across accounts without paying a service.",
      "Free: a printable rotation order so you do the highest-value accounts first.",
    ],
    cta: { href: "/help", label: "Read the free 24-hour actions" },
    upsell: { href: "/unlock", label: "Get the full paid checklist ($9)" },
  },
  {
    id: "mii-face-mask-from-image",
    icon: Sparkles,
    title: "Turn a photo into a repaintable Mii face mask",
    summary:
      "Walks through importing a face photo, choosing the right preset, and tuning the result so it actually paints square-by-square in-game.",
    audience: "Players who want a custom Mii based on a real face or character.",
    freePreview: [
      "Free: the import preset that works best for human faces.",
      "Free: when to drop to 16x16 vs stay at 32x32.",
      "Free: how to use the paint-by-numbers guide to avoid mistakes.",
    ],
    cta: { href: "/studio", label: "Open the studio and try it" },
  },
  {
    id: "reduce-colors-pixel-art",
    icon: Palette,
    title: "Reduce colors for repaintable pixel art",
    summary:
      "How to take a noisy image and bring it down to a tight palette that humans can repaint without losing the recognizable details.",
    audience: "Anyone moving from photos / illustrations to grid-painted art.",
    freePreview: [
      "Free: which palette IDs make the strongest outlines.",
      "Free: which one-cell details to keep and which to merge.",
      "Free: the optimizer settings that preserve facial readability.",
    ],
    cta: { href: "/studio", label: "Use the optimizer in the studio" },
  },
  {
    id: "password-reuse-cleanup",
    icon: ShieldCheck,
    title: "Password reuse cleanup after a community breach",
    summary:
      "A no-jargon guide to finding and rotating every account that shared the breached password, in priority order.",
    audience: "Anyone whose password from one service may have leaked.",
    freePreview: [
      "Free: how to check a password against breach datasets without sending it to anyone.",
      "Free: the priority order: financial, cloud, identity, social, everything else.",
      "Free: which 2FA methods to upgrade to and which to skip.",
    ],
    cta: { href: "/", label: "Run the browser-only password check" },
    upsell: {
      href: "/unlock",
      label: "Pair it with the recovery checklist or 30-min consult",
    },
  },
];

interface LongGuide {
  id: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  tagline: string;
  body: React.ReactNode;
}

const LONG_GUIDES: LongGuide[] = [
  {
    id: "mii-creation",
    icon: ScanFace,
    title: "How to make custom Miis for Tomodachi Life",
    tagline:
      "Mii Maker tricks, face presets, hair, eyes, eyebrows, and the small adjustments that take a Mii from 'okay' to 'looks like the person'.",
    body: (
      <>
        <p>
          Tomodachi Life lives or dies on whether your Miis look like the people
          you're trying to recreate. A bad likeness flattens the whole island.
          Below is the process that consistently gets recognizable Miis in
          fifteen minutes or less, even for faces that don't fit Nintendo's
          default templates.
        </p>

        <h4 className="font-semibold mt-4">Start from a real face, not a blank slate</h4>
        <p>
          The 3DS Mii Maker has a built-in "Look-Alike Mii" tool: from the home
          menu open Mii Maker, then Start from Scratch, then choose "Look-Alike
          Mii." It generates a Mii from a photo using the front-facing camera.
          The output is almost always wrong, but it's much faster to fix a wrong
          Mii than to build the right one from a blank canvas. Use it for the
          rough head shape and skin tone, then go in by hand for everything else.
        </p>
        <p>
          On a Wii U, use the same flow from the Mii Maker app via the GamePad
          camera. On the Nintendo Switch (Tomodachi Life isn't on Switch, but
          your Miis travel via QR), the System Settings Mii editor has the same
          starting point.
        </p>

        <h4 className="font-semibold mt-4">Eyes first, then mouth, then everything else</h4>
        <p>
          Recognition lives in two features: the eyes and the mouth. Get those
          right and almost any other mistake feels like personality rather than
          a flaw. Concretely:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Pick the eye shape that matches the squint level of the source face,
            not the color. Color is easy to fix; shape is what your brain reads
            as identity.
          </li>
          <li>
            Push eyes slightly closer together than Nintendo's defaults suggest
            for almost every real face. The default spacing reads as cartoony.
          </li>
          <li>
            Mouth width matters more than mouth shape. A wide mouth on a narrow
            face flattens the whole Mii.
          </li>
          <li>
            Eyebrows are the secret weapon. Tomodachi Life Miis read very
            differently depending on brow thickness and angle. Try three different
            brows on the same Mii and the difference is huge.
          </li>
        </ul>

        <h4 className="font-semibold mt-4">Hair is the last thing you adjust</h4>
        <p>
          New Mii builders almost always pick the hair first and then can't get
          the face to read. Build the face fully, then add hair, then re-tune
          the face one more pass. Hair shape changes the apparent width of the
          head, which throws off eye spacing and mouth position.
        </p>

        <h4 className="font-semibold mt-4">Save variants, not just the final</h4>
        <p>
          Mii Maker lets you keep up to 100 Miis. Use that capacity. Save the
          Mii at each major version (rough cast, eyes-fixed, mouth-fixed,
          finished) so if a later change ruins the likeness you can roll back.
          Once a Mii lives in your Tomodachi Life save, you can no longer edit
          its face from Mii Maker — only the in-game personality and outfit
          editor is available.
        </p>

        <h4 className="font-semibold mt-4">When the source is a drawing, not a photo</h4>
        <p>
          For anime characters, mascots, and game characters, the
          "Look-Alike" camera trick doesn't work. Instead, decompose the face
          into Mii-shaped parts in your head: which oval head shape, which eye
          set (round / sharp / closed), which mouth set, which hair silhouette.
          Drawings exaggerate certain features on purpose, so pick the Mii part
          that exaggerates the same thing.
        </p>
        <p>
          If you want to repaint the same face square-by-square as a pixel-art
          Mii face mask (the in-game item that lets the Mii wear a custom
          painted face), upload the source image into the{" "}
          <Link className="underline" href="/studio">
            Tomodachi Studio
          </Link>{" "}
          and run the import-to-grid flow. The studio handles the color reduction
          and exports a paint-by-numbers reference you can follow in the in-game
          editor without guessing.
        </p>
      </>
    ),
  },
  {
    id: "gameplay-basics",
    icon: Gamepad2,
    title: "Tomodachi Life gameplay basics: apartments, food, jobs, friendship, marriage",
    tagline:
      "The shortest path from 'I just got a Mii apartment' to a stable island with paired-up Miis, satisfied appetites, and steady cash flow.",
    body: (
      <>
        <p>
          Tomodachi Life looks like a chill sandbox but rewards a tiny bit of
          structure. Here's the early-game loop that gets you out of the
          unfocused phase fast.
        </p>

        <h4 className="font-semibold mt-4">Day one: the four daily checks</h4>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            Open every Mii apartment that has a status icon (thought bubble,
            sweat drop, food, etc.). The icon tells you what they want; ignoring
            it slows their happiness growth.
          </li>
          <li>
            Feed any Mii showing the food icon. Each Mii has favorites and
            dislikes — favorites give "all-time best" reactions and boost happiness
            faster than neutral foods.
          </li>
          <li>
            Solve any "Problem" notification. Problems are short mini-events
            (someone wants to confess, two Miis are fighting, a kid Mii is sick)
            and they only run once.
          </li>
          <li>
            Walk through the park, beach, and observation tower to trigger
            random events. Many friendships and relationships start here, not in
            the apartment.
          </li>
        </ol>

        <h4 className="font-semibold mt-4">Food: don't waste it on neutral reactions</h4>
        <p>
          Every Mii has a hidden favorite-foods list. The first time you feed a
          new food, the reaction tells you the grade: "I love it!" is favorite,
          "It's all right." is neutral, "I don't like it." is dislike. Stop
          feeding any food a Mii rated neutral or below — it costs money and
          gives almost nothing back.
        </p>
        <p>
          Cheap favorites are everywhere on the food list. You don't need to
          spring for expensive items. The reaction grade is what matters, not
          the price tag.
        </p>

        <h4 className="font-semibold mt-4">Jobs and cash flow</h4>
        <p>
          Money comes from three places: leveling up Miis (each level grants
          coins), selling stuff from the suggestion box, and minigames triggered
          by Mii requests. The suggestion box quietly accumulates value while
          you ignore it — empty it weekly or it stops generating new items.
        </p>
        <p>
          Don't hoard money. Every food you don't buy and every clothing item
          you skip is a happiness boost the Mii doesn't get. The compound effect
          on relationship progression is real.
        </p>

        <h4 className="font-semibold mt-4">Friendship and relationship gating</h4>
        <p>
          Two Miis become friends after a series of triggered events when you
          place them in the same apartment, send them to the park together, or
          let them randomly bump into each other. A Mii can have many friends.
        </p>
        <p>
          Romantic partners are stricter: a Mii has one "current crush" at a
          time, and confession events fire when the crush meter is high enough.
          You can nudge crushes by repeatedly placing two Miis in social
          situations, but if the meter never fills it usually means a personality
          mismatch — pair them with someone else.
        </p>

        <h4 className="font-semibold mt-4">Marriage and the next generation</h4>
        <p>
          Married couples can have a baby Mii after enough happy meals together.
          Baby Miis grow up over real-world days, eventually become teenagers,
          and at adulthood can either stay on your island or be sent traveling
          (with a QR code you can save). This is the engine for long-running
          islands: each generation introduces new face combinations that you
          didn't design yourself.
        </p>

        <h4 className="font-semibold mt-4">When the island gets boring</h4>
        <p>
          The classic mid-game slump hits around 40 Miis when every couple is
          paired off and most personalities have been seen. Three good reset
          moves: invite Miis from QR codes you haven't scanned (other people's
          designs introduce new personality combos), redo the apartment
          interiors in a coordinated theme (which renews the visual variety), or
          start a side project of pixel-art Mii face masks in the{" "}
          <Link className="underline" href="/studio">
            studio
          </Link>{" "}
          so you can return with new wearable items.
        </p>
      </>
    ),
  },
  {
    id: "breach-recovery",
    icon: AlertTriangle,
    title: "What to do after the Tomodachishare breach (post-shutdown recovery)",
    tagline:
      "Step-by-step for players affected by the Tomodachishare credential leak — including what's recoverable, what's not, and how to protect linked accounts before damage spreads.",
    body: (
      <>
        <p>
          If you received a breach notice referencing Tomodachishare or you
          remember reusing a password on a Tomodachi-fan community site that's
          since shut down, the threat model is straightforward: an attacker may
          have your email and a password you've used elsewhere. The actions
          below stop the bleeding.
        </p>

        <h4 className="font-semibold mt-4">In the first hour</h4>
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            Don't change the password on Tomodachishare yet. The site is
            shut down. Changing it there doesn't protect any account that
            actually matters.
          </li>
          <li>
            Open the{" "}
            <Link className="underline" href="/">
              browser-only password check
            </Link>{" "}
            on the home page and verify whether the password you used on
            Tomodachishare appears in any known breach dataset. The check is
            done locally — your password never leaves the browser, only a five-
            character SHA-1 prefix.
          </li>
          <li>
            Change the password on your primary email account first. If
            attackers can read your email they can reset everything else.
          </li>
          <li>
            Turn on two-factor authentication on that same email. Prefer an
            authenticator app or hardware key over SMS.
          </li>
        </ol>

        <h4 className="font-semibold mt-4">In the next 24 hours</h4>
        <p>
          Work through accounts in priority order: financial (banks, brokerage,
          PayPal, crypto exchanges), cloud storage (Google Drive, iCloud,
          Dropbox), identity (Apple ID, Microsoft account, Google account),
          social (Twitter/X, Instagram, Discord, Reddit), then everything else.
          Anywhere you reused the Tomodachishare password, change it to a unique
          one. A password manager makes this an evening of work rather than a
          month-long fight.
        </p>

        <h4 className="font-semibold mt-4">What's not recoverable</h4>
        <p>
          The data already exfiltrated cannot be unexfiltrated. Don't pay anyone
          who claims they can have it deleted; that's a common follow-on scam.
          Your name and email being on a breach list is annoying but not
          dangerous on its own — what's dangerous is the credential pair. Make
          sure the credential is no longer valid anywhere.
        </p>

        <h4 className="font-semibold mt-4">Save data that's actually at risk</h4>
        <p>
          If your Tomodachi Life save lived on a Nintendo Network ID that shared
          a password with the breach, the threat extends to your eShop balance
          and downloadable game library. Sign in to your NNID at the
          Nintendo Account site from a clean browser, change the password, and
          turn on 2-Step Verification. Then check the recent login activity for
          anything you don't recognize.
        </p>

        <h4 className="font-semibold mt-4">A 30-day monitoring rhythm</h4>
        <p>
          The first thirty days after a breach are when most secondary attacks
          land — attackers spend that time trying reused credentials against
          large targets. A useful monitoring rhythm: skim your email's "recent
          activity" page every Sunday, set Google Alerts for your email address
          and old usernames, and watch for unusual password reset emails. If you
          see one you didn't initiate, that account is being probed and is the
          next priority to lock down.
        </p>
        <p>
          For a structured written plan you can hand to a less-technical friend
          or family member, the paid{" "}
          <Link className="underline" href="/unlock">
            recovery checklist
          </Link>{" "}
          covers the same flow in a printable 12-step format, or you can book a
          30-minute consult to walk through your specific account inventory
          together.
        </p>
      </>
    ),
  },
  {
    id: "qr-and-backup",
    icon: QrCode,
    title: "Tomodachi Life QR codes, Mii sharing, and save backup",
    tagline:
      "How to share Miis with friends, scan QR codes from the wider community, and back up your save before the hardware finally dies.",
    body: (
      <>
        <p>
          Tomodachi Life shipped before the era of always-on cloud saves, which
          means the responsibility for protecting your island sits with you.
          The good news: QR codes and the SD card backup pathway are reliable
          if you set them up before something breaks.
        </p>

        <h4 className="font-semibold mt-4">Exporting a Mii as a QR code</h4>
        <p>
          From Mii Maker on the 3DS: pick the Mii, press Share, then QR Code /
          Image Options, then QR Code. The 3DS displays a high-density QR that
          encodes the full Mii (face, body, voice settings, creator name). Save
          it to the SD card as a screenshot or photograph the screen with
          another phone if you'd rather have it in a cloud-synced photo library.
        </p>
        <p>
          On the Wii U, the same flow lives in the Mii Maker app under Send/
          Receive → QR Code → Display QR Code. The encoding is compatible — a
          3DS QR will scan into a Wii U Mii Maker and vice versa.
        </p>

        <h4 className="font-semibold mt-4">Importing a Mii from a QR code</h4>
        <p>
          From the 3DS home screen: open Mii Maker, choose Receive a Mii from
          QR Code/Image, hold the 3DS camera over the code. The Mii lands in
          your Mii Maker but not yet in Tomodachi Life — open the game and
          import from Mii Maker so it becomes a resident.
        </p>
        <p>
          Each QR records the original creator's name. That's fine; you can
          still edit clothing and personality, but the original face design is
          locked once the Mii moves into a Tomodachi Life apartment.
        </p>

        <h4 className="font-semibold mt-4">Sharing islands and Mii sets at scale</h4>
        <p>
          A single QR code only encodes one Mii. To share an entire island
          (cast members, voice tweaks, apartment themes), the path is to export
          each Mii as a QR individually and bundle them. Community sites do
          this by posting QR code galleries grouped by theme (anime cast,
          presidents, K-pop, etc.). When importing a large set, take a
          screenshot of each Mii in Mii Maker before you import to Tomodachi
          Life — once a Mii is a resident, you can't easily get the original
          QR back if you delete the source.
        </p>

        <h4 className="font-semibold mt-4">Backing up your Tomodachi Life save</h4>
        <p>
          The 3DS does not natively back up game saves to cloud storage. The
          practical options:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>System transfer:</strong> if you're moving to a new 3DS,
            run the official system transfer from the source to the target
            console. It moves saves, eShop content, and SD card data together.
          </li>
          <li>
            <strong>Save data import/export:</strong> from System Settings →
            Data Management, you can export some game saves to SD card. Not
            every game supports this — verify with Tomodachi Life specifically
            before you delete anything.
          </li>
          <li>
            <strong>Third-party save managers:</strong> on a homebrew-enabled
            3DS, Checkpoint and similar tools can copy save files off the system
            entirely. Higher technical bar, but the only path that gives you a
            true off-device backup.
          </li>
        </ul>

        <h4 className="font-semibold mt-4">Before the hardware finally goes</h4>
        <p>
          The 3DS line is no longer manufactured and replacement units are
          getting expensive. If your console is your only copy of a years-long
          Tomodachi Life save, decide now what you'd want to keep. At minimum:
          screenshot every Mii's profile page (it includes age, personality
          stats, favorites, current relationships) and export every Mii as a QR
          code to an SD card you keep somewhere else. That way the cast survives
          even if the physical save doesn't.
        </p>
        <p>
          If you want to recreate Mii face masks (custom painted faces worn by
          Miis in-game) from photos or character art before you lose access,
          run the source images through the{" "}
          <Link className="underline" href="/studio">
            Tomodachi Studio
          </Link>{" "}
          and export the paint-by-numbers reference packs to your computer.
          Those files don't depend on the console at all.
        </p>
      </>
    ),
  },
];

// Per-guide structured data so each long-form section is eligible for
// rich-result treatment in Google. The first two (Mii creation, QR + save)
// are real step-by-step procedures so they use HowTo; the other two are
// closer to explainer articles so they use Article.
const GUIDES_STRUCTURED_DATA = [
  breadcrumbFor([{ name: "Home", href: "/" }, { name: "Guides", href: "/guides" }]),
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "How to make custom Miis for Tomodachi Life",
    description:
      "Step-by-step process for designing recognizable custom Miis: start with the Look-Alike camera tool, dial in eyes and mouth before hair, and save iteration variants in Mii Maker before they're locked into the game save.",
    inLanguage: "en",
    url: "https://tomodachi.pw/guides#mii-creation",
    image: "https://tomodachi.pw/og-image.png",
    totalTime: "PT15M",
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Start from a Look-Alike Mii, not a blank slate",
        text: "Open Mii Maker on the 3DS, choose Start from Scratch, then Look-Alike Mii. Use the camera to seed the head shape and skin tone. Output is almost always wrong but faster to fix than to build from blank.",
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Set eyes and mouth before hair",
        text: "Recognition lives in the eyes (shape, not color) and the mouth (width matters more than shape). Push eyes slightly closer than Nintendo defaults. Try three eyebrow sets before locking the brows.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Add hair last and re-tune the face",
        text: "Hair shape changes the apparent head width, which throws off eye spacing. Build face → add hair → re-tune face once more.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Save Mii Maker variants before importing to Tomodachi Life",
        text: "Mii Maker holds 100 Miis. Save rough, eyes-fixed, mouth-fixed, and final versions. Once a Mii moves into a Tomodachi Life apartment, the face is locked.",
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "Article",
    headline:
      "Tomodachi Life gameplay basics: apartments, food, jobs, friendship, marriage",
    description:
      "Beginner walkthrough of the core daily loop in Tomodachi Life — what to check each day, how to read food reactions, how friendship and crush gating actually works, and how to keep an island interesting past 40 Miis.",
    inLanguage: "en",
    url: "https://tomodachi.pw/guides#gameplay-basics",
    image: "https://tomodachi.pw/og-image.png",
    author: { "@type": "Organization", name: "Tomodachi", url: "https://tomodachi.pw/" },
    publisher: {
      "@type": "Organization",
      name: "Tomodachi",
      url: "https://tomodachi.pw/",
      logo: { "@type": "ImageObject", url: "https://tomodachi.pw/og-image.png" },
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "Article",
    headline:
      "What to do after the Tomodachishare breach (post-shutdown recovery)",
    description:
      "Hour-by-hour breach recovery plan for Tomodachishare users: which password to change first, which 2FA method to pick, how to assess Nintendo Network ID exposure, and a 30-day monitoring rhythm.",
    inLanguage: "en",
    url: "https://tomodachi.pw/guides#breach-recovery",
    image: "https://tomodachi.pw/og-image.png",
    author: { "@type": "Organization", name: "Tomodachi", url: "https://tomodachi.pw/" },
    publisher: {
      "@type": "Organization",
      name: "Tomodachi",
      url: "https://tomodachi.pw/",
      logo: { "@type": "ImageObject", url: "https://tomodachi.pw/og-image.png" },
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: "Tomodachi Life QR codes, Mii sharing, and save backup",
    description:
      "How to export Miis as QR codes from a 3DS or Wii U, scan QR codes from the wider community into Tomodachi Life, and back up a Tomodachi Life save before the hardware dies.",
    inLanguage: "en",
    url: "https://tomodachi.pw/guides#qr-and-backup",
    image: "https://tomodachi.pw/og-image.png",
    totalTime: "PT10M",
    step: [
      {
        "@type": "HowToStep",
        position: 1,
        name: "Export a Mii as a QR code",
        text: "From Mii Maker on the 3DS: choose Share → QR Code / Image Options → QR Code. Save the screenshot to SD or photograph the screen.",
      },
      {
        "@type": "HowToStep",
        position: 2,
        name: "Import a Mii from a QR code",
        text: "Mii Maker → Receive a Mii from QR Code/Image. Hold the camera over the code. The Mii lands in Mii Maker but you still need to import it into Tomodachi Life separately.",
      },
      {
        "@type": "HowToStep",
        position: 3,
        name: "Bundle an entire island for sharing",
        text: "Export each Mii as an individual QR, screenshot from Mii Maker before importing to Tomodachi Life, post the screenshots together as a themed gallery.",
      },
      {
        "@type": "HowToStep",
        position: 4,
        name: "Back up your Tomodachi Life save",
        text: "Use Nintendo's system transfer to move data between 3DS units, export game saves from System Settings → Data Management where supported, or use a homebrew tool like Checkpoint for off-device backup.",
      },
    ],
  },
];

export default function Guides() {
  useDocumentTitle("Guides", "Free walkthroughs on Mii creation, Tomodachi Life gameplay basics, Tomodachishare breach recovery, and QR codes + save backup.");
  useStructuredData(GUIDES_STRUCTURED_DATA);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="container flex items-center justify-between py-4">
          <Link href="/" className="text-sm font-medium hover:underline">
            ← Tomodachi
          </Link>
          <span className="text-xs text-muted-foreground">Free guides</span>
        </div>
      </header>

      <main id="main-content" className="container max-w-4xl py-10 sm:py-12 space-y-10 sm:space-y-12">
        <section>
          <h1 className="text-3xl sm:text-4xl font-semibold">Guides</h1>
          <p className="mt-2 text-muted-foreground">
            Practical walkthroughs for the people we actually serve: Tomodachi
            Life players turning faces and characters into Mii repaint plans,
            and visitors arriving from the Tomodachishare breach notice. Every
            guide gives you the working actions for free first, then points at
            an optional paid upgrade only if you want more depth.
          </p>
          <nav
            aria-label="Jump to guide"
            className="mt-4 flex flex-wrap gap-2 text-xs"
          >
            <a
              href="#mii-creation"
              className="rounded-sm border border-border bg-card px-2.5 py-1 hover:bg-accent"
            >
              Mii creation
            </a>
            <a
              href="#gameplay-basics"
              className="rounded-sm border border-border bg-card px-2.5 py-1 hover:bg-accent"
            >
              Gameplay basics
            </a>
            <a
              href="#breach-recovery"
              className="rounded-sm border border-border bg-card px-2.5 py-1 hover:bg-accent"
            >
              Breach recovery
            </a>
            <a
              href="#qr-and-backup"
              className="rounded-sm border border-border bg-card px-2.5 py-1 hover:bg-accent"
            >
              QR codes &amp; save backup
            </a>
          </nav>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {GUIDES.map((guide) => {
            const Icon = guide.icon;
            return (
              <Card
                key={guide.id}
                className="flex h-full flex-col gap-3 p-5"
              >
                <header className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 text-primary shrink-0" />
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold leading-snug">
                      {guide.title}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {guide.audience}
                    </p>
                  </div>
                </header>
                <p className="text-sm">{guide.summary}</p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {guide.freePreview.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {/* Buttons always stack vertically inside the card. Trying to
                    fit two buttons side-by-side breaks at <500px card widths
                    because some upsell labels (e.g. "Pair it with the recovery
                    checklist or 30-min consult") are too long to share a row. */}
                <div className="mt-auto flex flex-col gap-2 pt-2">
                  <Button asChild className="w-full whitespace-normal h-auto py-2">
                    <Link href={guide.cta.href}>
                      <span className="text-left">{guide.cta.label}</span>
                      <ArrowRight className="ml-1 h-3.5 w-3.5 shrink-0" />
                    </Link>
                  </Button>
                  {guide.upsell ? (
                    <Button
                      asChild
                      variant="outline"
                      className="w-full whitespace-normal h-auto py-2"
                    >
                      <Link href={guide.upsell.href}>
                        <span className="text-left">{guide.upsell.label}</span>
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </section>

        <section className="border-t border-border pt-8 space-y-2">
          <div className="flex items-start gap-2">
            <Users className="mt-1 h-5 w-5 text-primary" />
            <div>
              <h2 className="text-2xl font-semibold">
                Tomodachi Life player guides
              </h2>
              <p className="text-sm text-muted-foreground">
                In-depth, no-paywall articles for current and returning players.
              </p>
            </div>
          </div>
        </section>

        {LONG_GUIDES.map((guide) => {
          const Icon = guide.icon;
          return (
            <article
              key={guide.id}
              id={guide.id}
              className="border-t border-border pt-8 space-y-4 scroll-mt-24"
            >
              <header className="flex items-start gap-3">
                <Icon className="mt-0.5 h-6 w-6 text-primary shrink-0" />
                <div>
                  <h3 className="text-xl sm:text-2xl font-semibold leading-tight">
                    {guide.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {guide.tagline}
                  </p>
                </div>
              </header>
              <div className="prose-tight text-sm sm:text-[15px] leading-relaxed space-y-3 max-w-prose">
                {guide.body}
              </div>
              <footer className="pt-2 text-xs text-muted-foreground">
                Found this helpful?{" "}
                <Link href="/support" className="underline">
                  Drop a tip
                </Link>{" "}
                or{" "}
                <Link href="/unlock" className="underline">
                  pick up a paid checklist
                </Link>{" "}
                to fund the next one.
              </footer>
            </article>
          );
        })}

        <section className="border-t border-border pt-6">
          <h2 className="text-lg font-semibold">Help keep guides free</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every guide here stays free. Tips, paid checklists, and consults
            on{" "}
            <Link href="/unlock" className="underline">
              /unlock
            </Link>{" "}
            and{" "}
            <Link href="/support" className="underline">
              /support
            </Link>{" "}
            are what fund the next one.
          </p>
        </section>
      </main>
    </div>
  );
}
