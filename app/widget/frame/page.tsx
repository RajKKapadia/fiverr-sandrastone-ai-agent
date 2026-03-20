import { WidgetFrame } from "@/components/widget/widget-frame"

type WidgetFramePageProps = {
  searchParams: Promise<{
    siteKey?: string
  }>
}

export default async function WidgetFramePage({
  searchParams,
}: WidgetFramePageProps) {
  const { siteKey = "" } = await searchParams

  return (
    <>
      <style>{`
        html, body {
          background: transparent !important;
          overflow: hidden;
        }
      `}</style>
      <WidgetFrame siteKey={siteKey} />
    </>
  )
}
