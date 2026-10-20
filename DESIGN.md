---
version: alpha
name: Skyfall AI
description: A stark, editorial light-mode system with precise typography, restrained chrome, and a cool electric accent.
colors:
  primary: "#1A1A1A"
  secondary: "#3E57DA"
  tertiary: "#E5E7EB"
  neutral: "#FFFFFF"
  surface: "#FFFFFF"
  on-surface: "#1A1A1A"
  error: "#D92D20"
  primary-60: "#6B7BE6"
  primary-70: "#8C97EC"
  primary-80: "#B0B8F2"
  primary-90: "#D7DCF8"
typography:
  headline-display:
    fontFamily: Geist
    fontSize: 136px
    fontWeight: 500
    lineHeight: 163px
    letterSpacing: -6.12px
  headline-lg:
    fontFamily: Geist
    fontSize: 83px
    fontWeight: 500
    lineHeight: 86.4px
    letterSpacing: -4.32px
  headline-md:
    fontFamily: Geist
    fontSize: 51px
    fontWeight: 500
    lineHeight: 61px
    letterSpacing: -1.4px
  headline-sm:
    fontFamily: Geist
    fontSize: 31px
    fontWeight: 500
    lineHeight: 37px
    letterSpacing: 0px
  body-lg:
    fontFamily: Geist
    fontSize: 19px
    fontWeight: 400
    lineHeight: 29px
    letterSpacing: -0.38px
  body-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: -0.2px
  body-sm:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: -0.14px
  label-lg:
    fontFamily: Geist Mono
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0px
  label-md:
    fontFamily: Geist Mono
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Geist Mono
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0.04em
  caption:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0px
rounded:
  none: 0px
  sm: 4px
  md: 8px
  lg: 12px
  xl: 16px
  full: 9999px
spacing:
  xs: 8px
  sm: 20px
  md: 40px
  lg: 80px
  xl: 120px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: 8px 16px
    height: 44px
  button-primary-hover:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.neutral}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: 8px 16px
    height: 44px
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.label-md}"
    rounded: "{rounded.none}"
    padding: 8px 16px
    height: 44px
  button-link:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    padding: 0px
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: 16px
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: 12px 16px
  chip:
    backgroundColor: "{colors.primary-90}"
    textColor: "{colors.primary}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: 4px 10px
---

# Skyfall AI

## Overview
Skyfall AI feels like a premium, highly focused AI product with an editorial landing-page sensibility. The mood is minimal and intelligent rather than playful: lots of white space, one sharp dark text color, and a single cool blue accent that suggests precision and innovation. The composition is spacious, centered, and confident, designed for a technical or business audience that values clarity over ornament.

## Colors
- **Primary (#1A1A1A):** The dominant ink tone for headlines, body copy, navigation, and primary call-to-action surfaces. It carries the brand’s seriousness and gives the layout its crisp contrast.
- **Secondary (#3E57DA):** A vivid blue accent used for the animated mosaic at the top and for emphasis states. It adds a futuristic signal without overwhelming the page.
- **Tertiary (#E5E7EB):** A light neutral border tone for subtle dividers, card edges, and quiet structure. It keeps chrome visible but very restrained.
- **Neutral / Surface (#FFFFFF):** The base canvas for the entire interface. The system relies on this bright background to amplify typography and create a clean editorial feel.
- **On-surface (#1A1A1A):** The default readable text color on light surfaces. This should be used wherever maximum legibility is needed.
- **Error (#D92D20):** Reserved for destructive states and validation feedback. It should remain rare so the system preserves its calm, high-trust tone.
- **Primary scale (#6B7BE6, #8C97EC, #B0B8F2, #D7DCF8):** Softened blue steps used for motion trails, ambient graphics, subtle highlights, and low-emphasis emphasis states.

## Typography
Geist is the core type family throughout the experience, with Geist Mono reserved for navigational labels, compact utility text, and button treatments that need a more technical voice. Headlines are large, weight-500, and tightly tracked; the design uses strong negative letter-spacing to create a dramatic, compact editorial block. Body text stays regular-weight and comparatively open, with slightly tightened tracking to keep paragraphs clean and modern.

The hierarchy is intentionally blunt and highly legible:
- `headline-display`, `headline-lg`, and `headline-md` create the hero-driven, poster-like first impression.
- `headline-sm` supports section titles and smaller marketing headers.
- `body-lg`, `body-md`, and `body-sm` handle supporting copy and product explanation.
- `label-lg`, `label-md`, and `label-sm` support UI chrome, nav, and mono-styled metadata.
- `caption` is available for understated helper text.

Uppercase, monospaced labels and short all-caps-like navigation treatments reinforce the system’s analytical personality, even when the case remains technically mixed.

## Layout
The page is built around a centered, fixed-feeling editorial composition rather than a dense application grid. The hero content sits in a narrow vertical stack with generous breathing room, while the top navigation occupies a slim, horizontal band. Spacing follows a simple large-step rhythm using 8px, 20px, 40px, 80px, and 120px increments, which keeps the layout consistent without feeling mechanically dense.

Sections should favor wide margins, large internal gaps, and deliberate vertical separation. Cards and panels should remain lightweight with 16px internal padding unless they are meant to feel especially prominent. The system works best when content is allowed to float on the white canvas with minimal crowding.

## Elevation & Depth
The system is intentionally flat. Depth is expressed through contrast, spacing, and thin borders rather than shadows or layered surfaces. The visual language prefers crisp edges, quiet dividers, and tonal separation over elevation effects.

Use borders sparingly to define cards, navigation items, and interactive containers. The only strong emphasis should come from the dark primary button or from the blue accent modules in the hero mosaic. Avoid drop shadows unless a component explicitly needs a focus ring-like treatment.

## Shapes
The shape language is restrained and architectural. Corners are mostly sharp or only slightly softened, with 4px radii used for primary controls and 8px radii for cards. The result is precise and professional, not soft or friendly.

Use `rounded.none` for links and structural controls, `rounded.sm` for buttons, and `rounded.md` for cards or containers that need a subtle polish. `rounded.full` is appropriate for compact chips and pill labels only.

## Components
**Buttons:** The primary action is a dark filled button with white text, 8px by 16px padding, 44px height, and `rounded.sm`. It should feel solid and decisive. Secondary buttons are outlined or transparent, use `button-secondary`, and may adopt the monospaced label treatment seen in the nav and supporting actions. Link buttons should be visually minimal, using `button-link` with no fill, no border, and tight spacing. Hover states should remain simple: slightly shift the fill tone toward `secondary` or strengthen contrast, but do not introduce heavy shadow or motion.

**Cards:** Cards should use `card` with a white background, 1px light border, `rounded.md`, and modest 16px padding. Keep card content sparse and aligned with the broader editorial tone. Avoid decorative shadows; use spacing and border color to separate content.

**Inputs:** Inputs should look calm and utility-driven, with white surfaces, thin borders, `rounded.sm`, and body-sized type. Focus states should be clear but subtle, ideally relying on border color or a faint blue ring rather than a large halo.

**Chips:** Use `chip` for compact metadata, status markers, or tags. Chips should be pill-shaped, lightly tinted, and mono or small-label in feel so they read as technical annotations rather than buttons.

**Navigation / Utility links:** Top-level nav items and CTA links should stay narrow, uppercase-feeling, and aligned to the system’s mono label style. Keep them flat, with minimal padding and no ornamental underline except where a deliberate link cue is needed.

**Hero graphics:** The top mosaic/grid motif is part of the brand’s identity. It should use the primary scale of blues on a light grid, with small square modules and very subtle transparency variation to create motion without clutter.

## Do's and Don'ts
- Do keep the interface bright, spacious, and editorial.
- Do use Geist for most text and Geist Mono for technical labels or compact UI text.
- Do preserve the strong contrast between white surfaces and near-black text.
- Do keep accents limited to the blue palette so the brand feels disciplined.
- Don't introduce heavy shadows, gradients, or glassmorphism.
- Don't over-round components; the system should remain crisp and precise.
- Don't crowd the hero or reduce the generous whitespace around major headlines.
- Don't use more than a few accent colors at once; avoid visual noise.