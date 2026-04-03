import ContentPage from './ContentPage'
export default function Scenario() {
  return <ContentPage
    contentType="scenario"
    title="🎯 Tình huống Thuế"
    description="Mô tả tình huống — nhận phân tích pháp lý + hướng xử lý"
    placeholder="VD: Công ty A ký HĐ thuê nhà với cá nhân B, 20tr/tháng. B không có đăng ký KD. Cần chứng từ gì để khấu trừ CP? Nghĩa vụ thuế TNCN và GTGT?"
    defaultSlides={5}
    showStyleRefs={false}
    showClientFields={false}
  />
}
