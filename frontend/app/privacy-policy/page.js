'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft, ShieldCheck, Database, Target, Scale, Clock,
  Share2, UserCheck, Mail,
} from 'lucide-react';

const Section = ({ icon: Icon, title, num, children }) => (
  <motion.section
    initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: '-50px' }} transition={{ duration: 0.3 }}
    className="border-b border-slate-100 last:border-0 py-6 first:pt-0">
    <h2 className="text-base font-bold text-slate-900 flex items-center gap-2.5 mb-3">
      <span className="p-1.5 bg-brand-50 rounded-md text-brand-700">
        <Icon size={16} />
      </span>
      <span className="text-brand-700 text-sm tabular-nums">{num}.</span>
      {title}
    </h2>
    <div className="ml-10 text-sm text-slate-700 space-y-2 leading-relaxed">
      {children}
    </div>
  </motion.section>
);

const Bullet = ({ children }) => (
  <li className="flex gap-2">
    <span className="text-brand-500 select-none mt-0.5">•</span>
    <span>{children}</span>
  </li>
);

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <Link href="/login"
          className="inline-flex items-center gap-1.5 text-brand-700 text-sm hover:underline mb-4">
          <ArrowLeft size={14} /> กลับสู่หน้า Login
        </Link>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="card p-8 sm:p-10">
          <div className="flex items-start gap-4 pb-6 border-b border-slate-200 mb-2">
            <div className="p-3 bg-gradient-to-br from-brand-700 to-brand-900 rounded-xl shadow-md shadow-brand-900/20 flex-shrink-0">
              <ShieldCheck className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                ประกาศนโยบายความเป็นส่วนตัว
              </h1>
              <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-2 flex-wrap">
                <span>Privacy Notice</span>
                <span className="text-slate-300">·</span>
                <span>ปรับปรุงล่าสุด: <em className="text-slate-400">ระบุวันที่</em></span>
                <span className="text-slate-300">·</span>
                <span className="badge bg-brand-50 text-brand-700">v1.0</span>
              </p>
            </div>
          </div>

          <Section num="1" icon={Database} title="ข้อมูลที่เก็บรวบรวม">
            <p>ระบบ DocSign จัดเก็บข้อมูลส่วนบุคคลของพนักงานดังนี้:</p>
            <ul className="space-y-1.5 mt-2">
              <Bullet><b className="text-slate-900">ข้อมูลระบุตัวตน:</b> รหัสพนักงาน (employee_id), ชื่อ-นามสกุล, อีเมล</Bullet>
              <Bullet><b className="text-slate-900">ข้อมูลการเข้าสู่ระบบ:</b> รหัสผ่านที่ผ่านการเข้ารหัส (bcrypt) — ระบบไม่สามารถถอดกลับเป็นรหัสจริงได้</Bullet>
              <Bullet><b className="text-slate-900">ข้อมูลลายมือชื่อ:</b> รูปภาพลายเซ็นที่วาดผ่านระบบ, ตำแหน่งและขนาดของลายเซ็นบนเอกสาร, เวลาที่ลงนาม</Bullet>
              <Bullet><b className="text-slate-900">ข้อมูลการใช้งาน:</b> IP address, User-Agent, เวลาและประเภทของการกระทำ</Bullet>
            </ul>
          </Section>

          <Section num="2" icon={Target} title="วัตถุประสงค์ของการเก็บรวบรวม">
            <ul className="space-y-1.5">
              <Bullet>เพื่อจัดการเอกสารและการลงนามภายในองค์กร</Bullet>
              <Bullet>เพื่อตรวจสอบและพิสูจน์การลงนาม (audit trail) ตามกฎหมายและนโยบายภายใน</Bullet>
              <Bullet>เพื่อรักษาความปลอดภัยของระบบและตรวจสอบความผิดปกติ</Bullet>
            </ul>
          </Section>

          <Section num="3" icon={Scale} title="ฐานทางกฎหมายในการประมวลผล">
            <p>
              องค์กรประมวลผลข้อมูลของท่านบนพื้นฐานของ <b className="text-slate-900">ประโยชน์โดยชอบด้วยกฎหมาย (legitimate interest)</b>
              {' '}ตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 มาตรา 24(5)
              เพื่อใช้ในการดำเนินการลงนามเอกสารตามกระบวนการทำงานปกติของบริษัท
            </p>
          </Section>

          <Section num="4" icon={Clock} title="ระยะเวลาการเก็บรักษา">
            <ul className="space-y-1.5">
              <Bullet><b className="text-slate-900">ข้อมูลผู้ใช้และลายเซ็น:</b> เก็บตลอดระยะเวลาการเป็นพนักงาน + ตามอายุความของเอกสารที่ลงนาม</Bullet>
              <Bullet><b className="text-slate-900">Audit log:</b> เก็บไม่เกิน 365 วัน (ลบโดยอัตโนมัติหลังจากนั้น)</Bullet>
              <Bullet><b className="text-slate-900">Backup:</b> เก็บย้อนหลัง 30 วัน</Bullet>
            </ul>
          </Section>

          <Section num="5" icon={Share2} title="การเปิดเผยข้อมูล">
            <p>ข้อมูลที่จัดเก็บจะ<b className="text-slate-900">ไม่เปิดเผยต่อบุคคลภายนอก</b> ยกเว้นกรณี:</p>
            <ul className="space-y-1.5 mt-2">
              <Bullet>ได้รับความยินยอมเป็นลายลักษณ์อักษรจากเจ้าของข้อมูล</Bullet>
              <Bullet>มีคำสั่งศาลหรือหน่วยงานราชการที่มีอำนาจตามกฎหมาย</Bullet>
              <Bullet>เจ้าหน้าที่ฝ่าย IT ภายในองค์กรซึ่งมีหน้าที่ดูแลระบบ</Bullet>
            </ul>
          </Section>

          <Section num="6" icon={UserCheck} title="สิทธิของเจ้าของข้อมูล">
            <p>ภายใต้ พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล ท่านมีสิทธิ:</p>
            <ul className="space-y-1.5 mt-2">
              <Bullet>ขอเข้าถึงและขอสำเนาข้อมูลส่วนบุคคลของท่าน (มาตรา 30)</Bullet>
              <Bullet>ขอแก้ไขข้อมูลที่ไม่ถูกต้อง (มาตรา 35)</Bullet>
              <Bullet>ขอลบข้อมูล (มาตรา 33) — ภายใต้เงื่อนไขที่กฎหมายกำหนด</Bullet>
              <Bullet>คัดค้านการประมวลผลข้อมูล (มาตรา 32)</Bullet>
              <Bullet>ขอถอนความยินยอมเมื่อใดก็ได้ (กรณีที่ใช้ฐาน consent)</Bullet>
            </ul>
          </Section>

          <Section num="7" icon={Mail} title="ผู้ควบคุมข้อมูลและช่องทางติดต่อ">
            <p>
              หากต้องการใช้สิทธิข้างต้น หรือมีข้อสงสัยเกี่ยวกับการจัดการข้อมูลส่วนบุคคล
              กรุณาติดต่อเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคล (DPO) ขององค์กรที่:
            </p>
            <div className="mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg">
              <em className="text-slate-500">ระบุชื่อ DPO และอีเมลติดต่อที่นี่</em>
            </div>
          </Section>

          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-xs text-slate-400 italic text-center">
              หากนโยบายนี้มีการแก้ไขในอนาคต ระบบจะแจ้งให้ท่านยอมรับเวอร์ชันใหม่อีกครั้ง
              ในการเข้าใช้งานระบบครั้งถัดไป
            </p>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
