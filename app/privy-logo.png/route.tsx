import { ImageResponse } from "next/og";
import { LOGO_PATH, LOGO_VIEWBOX } from "@/components/logo";

/*
 * The logo Privy shows on its login modal: a 180x90 PNG (the size Privy asks for), set by URL in
 * the Privy dashboard. The mark is drawn from the same path as <Logo>, in the modal's ink colour
 * (Privy runs in its light theme), on a transparent background. Rendered once, at build time.
 */

export const dynamic = "force-static";

const WIDTH = 180;
const HEIGHT = 90;
const MARK_WIDTH = 156;
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
