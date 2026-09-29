import { ImageResponse } from "next/og";
import { LOGO_PATH, LOGO_VIEWBOX } from "@/components/logo";

/*
 * The logo Privy shows on its login modal, set by URL in the Privy dashboard. Privy asks for the
 * 2:1 shape of 180x90 and shows it at about that size in CSS pixels, so on a 2x or 3x screen a
 * 180x90 file is stretched and blurs. This one is drawn at 4x (720x360) and Privy scales it down.
 * The mark is drawn from the same path as <Logo>, in the modal's ink colour (Privy runs in its
 * light theme), on a transparent background. Rendered once, at build time.
 */

export const dynamic = "force-static";

const SCALE = 4;
const WIDTH = 180 * SCALE;
const HEIGHT = 90 * SCALE;
const MARK_WIDTH = 156 * SCALE;
const [, , viewBoxWidth, viewBoxHeight] = LOGO_VIEWBOX.split(" ").map(Number);

export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={MARK_WIDTH} height={(MARK_WIDTH * viewBoxHeight) / viewBoxWidth} viewBox={LOGO_VIEWBOX}>
          <path fill="#0b0b0c" fillRule="evenodd" d={LOGO_PATH} />
        </svg>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );
}
