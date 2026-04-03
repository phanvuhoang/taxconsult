import ContentPage from './ContentPage'
export default function Analysis() {
  return <ContentPage
    contentType="analysis"
    title="📝 Bài Phân tích Chuyên sâu"
    description="Phân tích chuyên sâu một vấn đề thuế cụ thể"
    placeholder="VD: Quy định về khấu trừ chi phí lãi vay theo Khoản 3 Điều 16 Luật CIT 2024 — phân tích tác động với doanh nghiệp FDI"
    defaultSlides={15}
    showStyleRefs={true}
    showClientFields={false}
  />
}
