import { HomeCta } from "./home/HomeCta";
import { HomeFooter } from "./home/HomeFooter";
import { HomeNav } from "./home/HomeNav";

/**
 * The site's shared header, closing call to action and footer, used on every
 * public page (the home page renders the same three components directly).
 *
 * Each is wrapped in .pf-root because its stylesheet scopes the colour and type
 * tokens, and the content-box sizing it was authored against, to that class;
 * the pages around them are Tailwind and keep border-box.
 *
 * .pf-solid gives the header its dark bar from the first pixel. On the home
 * page the header starts transparent over the 3D hero instead.
 */
export function SiteNav() {
  return (
    <div className="pf-root pf-solid">
      <HomeNav />
    </div>
  );
}

export function SiteCta({ email }: { email?: string | null }) {
  return (
    <div className="pf-root">
      <HomeCta email={email ?? undefined} />
    </div>
  );
}

export function SiteFooter({
  email,
  socialLinks,
}: {
  email?: string | null;
  socialLinks?: { label: string; url: string }[];
}) {
  return (
    <div className="pf-root">
      <HomeFooter email={email ?? undefined} socialLinks={socialLinks} />
    </div>
  );
}
