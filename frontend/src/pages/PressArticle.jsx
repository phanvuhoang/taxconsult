import ContentPage from './ContentPage'
export default function PressArticle() {
  return <ContentPage
    contentType="press"
    title="📰 Bài Viết Báo"
    description="Bài báo về thuế theo phong cách storytelling, dễ hiểu"
    placeholder="VD: Bỏ thuế khoán 2026 — 5 triệu hộ kinh doanh phải làm gì?"
    defaultSlides={8}
    showStyleRefs={true}
    showClientFields={false}
  />
}
