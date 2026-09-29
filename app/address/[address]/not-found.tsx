import Link from "next/link";
import { Navbar } from "@/components/navbar";

export default function AddressNotFound() {
  return (
    <>
      <Navbar cta="always" />
      <main className="ad-missing">
        <p className="ad-eyebrow">Not an executable address</p>
        <h1 className="ad-missing-title">Execute has no terms for this address.</h1>
        <p className="ad-missing-lede">
          Execute didn’t create it, so it’s an ordinary address, or one made with the contracts directly. Nothing here can say what
          sending to it does.
        </p>
        <Link href="/" className="cta-secondary">
          What Execute does
        </Link>
      </main>
    </>
  );
}
