// Marketing texts for each service page (what we do, why us, how it works). Edit freely — no code changes needed.
import type { Lang } from "@domain/types";

export interface ServiceInfo {
  tagline: string;
  benefits: { icon: string; title: string; text: string }[];
  steps: string[];
}

type Code = "trash" | "carpet" | "curtain";

export const SERVICE_INFO: Record<Code, Record<Lang, ServiceInfo>> = {
  trash: {
    uz: {
      tagline: "Chiqindingizni eshigingiz oldidan olib ketamiz — tez, toza va o'zingizga qulay vaqtda.",
      benefits: [
        { icon: "clock", title: "Qulay vaqt", text: "Bugun yoki hafta davomida 2 soatlik oraliqni o'zingiz tanlaysiz." },
        { icon: "bell", title: "Har qadamda xabar", text: "Kuryer olganda va yo'lga chiqqanda darhol bilasiz." },
        { icon: "trash", title: "Har qanday chiqindi", text: "Maishiy, nomaishiy va qurilish chiqindilari." },
        { icon: "wallet", title: "Qulay to'lov", text: "Naqd, Click, Payme, karta yoki obuna orqali." },
      ],
      steps: ["Joy va chiqindi turini tanlaysiz", "Qulay vaqtni belgilaysiz", "Kuryer kelib olib ketadi", "Hammasi toza ✨"],
    },
    ru: {
      tagline: "Заберём мусор прямо от вашей двери — быстро, чисто и в удобное время.",
      benefits: [
        { icon: "clock", title: "Удобное время", text: "Сегодня или в течение недели — интервалы по 2 часа." },
        { icon: "bell", title: "Уведомления на каждом шаге", text: "Сразу узнаете, когда курьер взял заказ и выехал." },
        { icon: "trash", title: "Любой мусор", text: "Бытовой, небытовой и строительный." },
        { icon: "wallet", title: "Удобная оплата", text: "Наличные, Click, Payme, карта или подписка." },
      ],
      steps: ["Выбираете место и тип мусора", "Указываете удобное время", "Курьер приезжает и забирает", "Всё чисто ✨"],
    },
    en: {
      tagline: "We pick up your trash right from your door — fast, clean and at a time that suits you.",
      benefits: [
        { icon: "clock", title: "A time that suits you", text: "Today or later this week, in 2-hour windows." },
        { icon: "bell", title: "Updates at every step", text: "You'll know when a courier takes it and sets off." },
        { icon: "trash", title: "Any kind of trash", text: "Household, non-residential and construction debris." },
        { icon: "wallet", title: "Easy payment", text: "Cash, Click, Payme, card or subscription." },
      ],
      steps: ["Choose the place and type of trash", "Pick a time", "A courier comes and takes it", "All clean ✨"],
    },
  },
  carpet: {
    uz: {
      tagline: "Gilamlaringizni uydan olib ketamiz, chuqur yuvib, toza va xushbo'y holda qaytaramiz.",
      benefits: [
        { icon: "sparkle", title: "Premium yuvish vositalari", text: "Gilam rangi va tolasini asraydigan sifatli kukun va shampunlar." },
        { icon: "settings", title: "Zamonaviy texnika", text: "Professional uskunalar bilan chuqur tozalash va to'liq quritish." },
        { icon: "edit", title: "Aniq o'lchov", text: "Kuryer har bir gilamni o'lchaydi — faqat haqiqiy maydon uchun to'laysiz." },
        { icon: "truck", title: "Olib ketamiz va qaytaramiz", text: "Uyingizdan olib ketamiz, yuvilgach o'zimiz olib kelamiz." },
      ],
      steps: ["Buyurtma berasiz", "Kuryer kelib o'lchaydi, narxni botga yuboramiz", "Tasdiqlaysiz — olib ketib, yuvamiz", "Toza gilamni uyingizga yetkazamiz"],
    },
    ru: {
      tagline: "Заберём ковры из дома, глубоко постираем и вернём чистыми и свежими.",
      benefits: [
        { icon: "sparkle", title: "Премиальные средства", text: "Качественные порошки и шампуни, бережные к цвету и ворсу." },
        { icon: "settings", title: "Современная техника", text: "Глубокая чистка и полная сушка на профессиональном оборудовании." },
        { icon: "edit", title: "Точный замер", text: "Курьер измерит каждый ковёр — платите только за реальную площадь." },
        { icon: "truck", title: "Заберём и привезём", text: "Заберём из дома и сами привезём после стирки." },
      ],
      steps: ["Оформляете заказ", "Курьер приезжает и измеряет, цену присылаем в бот", "Подтверждаете — забираем и стираем", "Привозим чистый ковёр домой"],
    },
    en: {
      tagline: "We take your carpets from home, deep-clean them and bring them back fresh and clean.",
      benefits: [
        { icon: "sparkle", title: "Premium cleaning products", text: "Quality powders and shampoos that protect colour and fibres." },
        { icon: "settings", title: "Modern equipment", text: "Deep cleaning and full drying on professional machines." },
        { icon: "edit", title: "Exact measuring", text: "The courier measures every carpet — you pay for the real area only." },
        { icon: "truck", title: "We take and return", text: "We pick them up from home and bring them back after washing." },
      ],
      steps: ["You place an order", "A courier measures; we send the price to the bot", "You confirm — we take and wash them", "We bring the clean carpet home"],
    },
  },
  curtain: {
    uz: {
      tagline: "Pardalaringizni ehtiyotkorlik bilan yechib olamiz, yuvamiz va chiroyli qilib qayta osib beramiz.",
      benefits: [
        { icon: "sparkle", title: "Premium kukun", text: "Nozik matolar uchun maxsus yumshoq vositalar." },
        { icon: "settings", title: "Zamonaviy usul", text: "Har bir mato turiga mos harorat va yuvish rejimi." },
        { icon: "hand", title: "Yechamiz va osib beramiz", text: "Pardalarni o'zimiz yechib olamiz va chiroyli qilib qayta osamiz." },
        { icon: "edit", title: "Aniq o'lchov", text: "Har bir pardani o'lchaymiz — faqat haqiqiy maydon uchun to'laysiz." },
      ],
      steps: ["Buyurtma berasiz", "Kuryer kelib pardalarni yechadi va o'lchaydi", "Narxni tasdiqlaysiz — yuvamiz", "Olib kelib, chiroyli qilib qayta osib beramiz"],
    },
    ru: {
      tagline: "Аккуратно снимем шторы, постираем и красиво повесим обратно.",
      benefits: [
        { icon: "sparkle", title: "Премиальный порошок", text: "Специальные мягкие средства для деликатных тканей." },
        { icon: "settings", title: "Современный подход", text: "Температура и режим под каждый тип ткани." },
        { icon: "hand", title: "Снимем и повесим", text: "Сами снимем шторы и красиво повесим обратно." },
        { icon: "edit", title: "Точный замер", text: "Измерим каждую штору — платите только за реальную площадь." },
      ],
      steps: ["Оформляете заказ", "Курьер приезжает, снимает и измеряет шторы", "Подтверждаете цену — стираем", "Привозим и красиво вешаем обратно"],
    },
    en: {
      tagline: "We carefully take your curtains down, wash them and hang them back beautifully.",
      benefits: [
        { icon: "sparkle", title: "Premium powder", text: "Special gentle products for delicate fabrics." },
        { icon: "settings", title: "Modern technique", text: "The right temperature and programme for every fabric." },
        { icon: "hand", title: "We take down and re-hang", text: "We take the curtains down and hang them back beautifully." },
        { icon: "edit", title: "Exact measuring", text: "We measure every curtain — you pay for the real area only." },
      ],
      steps: ["You place an order", "A courier comes, takes the curtains down and measures them", "You confirm the price — we wash them", "We bring them back and hang them beautifully"],
    },
  },
};
