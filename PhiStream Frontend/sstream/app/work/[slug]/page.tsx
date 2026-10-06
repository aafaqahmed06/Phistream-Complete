import { notFound } from "next/navigation";
import { DocPage, docMetadata } from "@/components/DocPage";
import { caseStudies } from "@/lib/content";

/** Illustrative case studies: /work/creator, /work/founder */
export const revalidate = 60;
export const dynamicParams = false;

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return Object.keys(caseStudies).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props) {
  const page = caseStudies[(await params).slug];
  return page ? docMetadata(page) : {};
}

export default async function Page({ params }: Props) {
  const page = caseStudies[(await params).slug];
  if (!page) notFound();
  return <DocPage page={page} />;
}
