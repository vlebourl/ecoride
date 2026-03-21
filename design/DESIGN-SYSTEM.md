# Design System Document: The Kinetic Monolith

## 1. Overview & Creative North Star
**The Creative North Star: "Precision Ecology"**

This design system rejects the cluttered, "gamified" aesthetic typical of fitness trackers in favor of a high-end, data-driven editorial experience. It is inspired by Swiss minimalism and performance automotive instrumentation. We move beyond "standard" dark mode by utilizing an OLED-first philosophy where the interface doesn't just sit on the screen—it emerges from the void.

To break the "template" look, we utilize **Intentional Asymmetry**. Key data points (CO2 saved, distance) are not confined to equal-width columns; they are weighted based on their ecological impact, using massive typography scales that bleed toward the edges of the screen, creating a sense of momentum and scale.

---

## 2. Colors
The palette is rooted in deep obsidian tones to preserve battery life and provide a canvas for our signature high-frequency green.

*   **Core Palette:**
    *   **Background:** `#0A0A0A` → `#131313` (The void)
    *   **Primary (Accent):** `#42e5b0` (High-visibility ecological green)
    *   **Primary Container:** `#00C896` (Used for high-priority data blocks)
    *   **Surface:** `#131313` → `#141414`
    *   **Surface Container (Lowest to Highest):** `#0e0e0e` → `#353534`

*   **The "No-Line" Rule:**
    Prohibit the use of 1px solid borders for sectioning. Separation must be achieved through **Tonal Shifting**. For example, a `surface-container-low` (`#1c1b1b`) card should sit on a `surface` (`#131313`) background. Let the change in value define the edge, not a stroke.

*   **Surface Hierarchy & Nesting:**
    Treat the UI as layered sheets of obsidian. Use `surface-container-lowest` for the main background and `surface-container-high` (`#2a2a2a`) for interactive elements like input fields or toggle backgrounds. This creates "nested depth" where the most important interactive elements appear to sit closest to the user.

*   **The Glass Rule:**
    For floating navigation bars or "Active Ride" overlays, use semi-transparent `surface-variant` with a 20px backdrop blur. This ensures the data-rich map or list behind it remains visible but diffused, maintaining a sense of place.

---

## 3. Typography
We use **Inter** as a variable font to maximize legibility at extreme scales.

*   **Display (Large Numbers):** `display-lg` (3.5rem) and `display-md` (2.75rem). Use these for primary metrics (KM, Speed, CO2). These should be Bold (700+) to create a "data-heavy" editorial feel similar to high-end financial apps.
*   **Headlines:** `headline-sm` (1.5rem). Used for screen titles. Always sentence case to maintain an approachable, premium tone.
*   **Body:** `body-md` (0.875rem). For descriptions and secondary metadata.
*   **Labels:** `label-sm` (0.6875rem). All-caps with increased tracking (+5%) for "micro-data" like unit measurements (e.g., "KILOMETERS").

The hierarchy relies on **Contrast, not Size**. A massive `display-lg` metric paired with a tiny, high-tracking `label-sm` unit creates an authoritative, custom-tailored look.

---

## 4. Elevation & Depth
In this system, elevation is a product of light, not shadows.

*   **The Layering Principle:**
    Depth is achieved by "stacking" tones.
    *   Base: `surface`
    *   In-Page Cards: `surface-container-low`
    *   Active/Interactive Elements: `surface-container-high`
*   **Ambient Shadows:**
    Avoid traditional drop shadows. If an element must float (e.g., a "Start Ride" button), use a diffused shadow: `0px 20px 40px rgba(0, 0, 0, 0.4)`. The shadow should feel like a soft glow of darkness, not a hard edge.
*   **The "Ghost Border" Fallback:**
    If a boundary is required for accessibility, use the `outline-variant` (`#3c4a43`) at 15% opacity. It should be felt, not seen.

---

## 5. Components

*   **Buttons:**
    *   *Primary:* `primary` background with `on-primary` text. Use `xl` (1.5rem) roundedness for a pill-shaped, organic feel.
    *   *Secondary:* `surface-container-highest` background. No border.
*   **Cards:**
    *   Forbid divider lines. Use `spacing-6` (1.3rem) to separate internal content.
    *   Corner radius: Always `md` (0.75rem / 12px) as per request, creating a consistent "containerized" look.
*   **Data Visualization (The "Finary" Style):**
    Use `primary` for lines and `surface-variant` for grid-axis. Graphs should bleed to the edge of the card to maximize the "Premium Editorial" feel.
*   **Input Fields:**
    Use `surface-container-highest` with no border. Upon focus, use a "Ghost Border" of `primary` at 30% opacity.
*   **The "Impact" Chip:**
    A custom component for EcoRide. A `secondary-container` pill with `on-secondary-container` text, used to highlight eco-achievements (e.g., "Leaf Earned").

---

## 6. Do's and Don'ts

*   **DO:** Use extreme typographic scale. Make the numbers the hero of the design.
*   **DO:** Use `spacing-20` (4.5rem) for section breathing room. High-end design requires "wasted" space.
*   **DO:** Ensure all touch targets for bikers (Start/Stop) are at least `spacing-16` (3.5rem) in height for usability with gloves.
*   **DON'T:** Use 1px solid lines to separate list items. Use a `0.1rem` shift in background color or simply whitespace.
*   **DON'T:** Use pure black (#000) for anything other than the base background. It kills the "tonal layering" effect.
*   **DON'T:** Use icons with different stroke weights. Stick to a 1.5pt or 2pt linear icon set that matches the Inter font weight.

---

## Stitch Project

- **Project ID:** `6610004770254309458`
- **Generated screens:** Dashboard, Trajet, Stats, Classement, Profil
- **Model:** Gemini 3.1 Pro
- **Theme:** "EcoRide Obsidian" / "Obsidian Eco"

*Note: This system is designed to feel intentional and architectural. Every pixel must serve the data or the earth.*
