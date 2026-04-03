import ContentPage from './ContentPage'
export default function TaxAdvice() {
  return <ContentPage
    contentType="advice"
    title="✉️ Thư Tư vấn Thuế"
    description="Thư tư vấn chuyên nghiệp gửi khách hàng"
    placeholder="VD: Công ty XYZ muốn biết nghĩa vụ thuế khi nhận chuyển nhượng vốn từ công ty mẹ nước ngoài..."
    defaultSlides={6}
    showStyleRefs={true}
    showClientFields={true}
  />
}
