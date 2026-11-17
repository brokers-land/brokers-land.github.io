// ตั้งค่าที่เก็บข้อมูลของเว็บ (หน้า admin ใช้บันทึกข้อมูลลง GitHub)
window.BL_CONFIG = {
  owner: 'brokers-land',          // ชื่อบัญชี GitHub (ใช้เมื่อเปิดผ่านโดเมนของตัวเอง)
  repo: 'brokers-land.github.io', // ชื่อ repository (ใช้เมื่อเปิดผ่านโดเมนของตัวเอง)
  branch: '',                     // branch ที่เปิด GitHub Pages ('' = ใช้ branch หลักของ repo)
  dir: 'docs'                     // โฟลเดอร์ของเว็บใน repository
};

// เมื่อเปิดผ่าน <ชื่อบัญชี>.github.io ให้อ่านชื่อบัญชีและ repo จากลิงก์เอง
// (เปลี่ยนชื่อ repo หรือย้ายไปบัญชีอื่นแล้วไม่ต้องแก้ไฟล์นี้)
(function (c) {
  var host = location.hostname.toLowerCase();
  if (!/\.github\.io$/.test(host)) return;
  c.owner = host.replace(/\.github\.io$/, '');
  var first = location.pathname.split('/')[1] || '';
  c.repo = (first && first !== c.dir && !/\.html?$/.test(first)) ? decodeURIComponent(first) : host;
})(window.BL_CONFIG);
