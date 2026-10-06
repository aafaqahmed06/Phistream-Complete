import { notFound } from "next/navigation";
import { DocPage, docMetadata } from "@/components/DocPage";
import { pages } from "@/lib/content";

/** /services, /creators, /founders, /how-we-work, /careers, /privacy, /terms */
export const revalidate = 60;
export const dynamicParams = false;

type Props = { params: Promise<{ page: string }> };

export function generateStaticParams() {
  return Object.keys(pages).map((page) => ({ page }));
}

export async function generateMetadata({ params }: Props) {
  const page = pages[(await params).page];
  return page ? docMetadata(page) : {};
}

export default async function Page({ params }: Props) {
  const page = pages[(await params).page];
  if (!page) notFound();
  return <DocPage page={page} />;
}
