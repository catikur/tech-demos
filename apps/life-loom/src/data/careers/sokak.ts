import type { Pack } from "../../engine/sim.ts";

// Sonuçların hayatı: kolay para, baskı, kapı, çıkış.
// Yöntem yok. Ne yapıldığı değil, bedelin tutup tutmadığı yazılır.

const pack: Pack = {
  id: "sokak",
  name: "Sokak",
  role: "sokakta büyüyen",
  pitch: "Cesaret kapıyı açar, beden faturayı öder. Her gece bir yüzde.",
  names: ["Rüzgar", "Asya", "Baran", "Melis", "Umut", "Cemre"],
  vital: "beden",
  stats: [
    { key: "cesaret", label: "Cesaret" },
    { key: "sadakat", label: "Sadakat" },
    { key: "nakit", label: "Nakit" },
    { key: "beden", label: "Beden" },
  ],
  origins: [
    { id: "sahil", name: "Sahil", weight: 4, hue: 188, blurb: "Gece uzun, tanıdık yüz az.", mods: { cesaret: 4, nakit: 2 } },
    { id: "tepe", name: "Tepe", weight: 4, hue: 78, blurb: "Dar sokak, herkesin birbirini bildiği yer.", mods: { sadakat: 8, nakit: -4 } },
    { id: "carsi", name: "Çarşı", weight: 3, hue: 32, blurb: "Gürültü, borç, açık dükkân.", mods: { nakit: 4, beden: 4, sadakat: -2 } },
  ],
  lifestyles: [
    { id: "kenar", name: "Kenarda", weight: 4, blurb: "Çağrıyı duyar, çoğu gece dönmez.", mods: { beden: 4, cesaret: -2 } },
    { id: "iceri", name: "İçeride", weight: 3, blurb: "Masa onu tanır. Çıkış pahalıdır.", mods: { sadakat: 6, nakit: 4, beden: -4 } },
  ],
  beats: [
    {
      id: "cagri",
      years: "17",
      title: "Çağrı",
      hook: "Bir masa seni ister. Sadakat artarsa sonraki yüzdeler de o masaya bağlanır.",
      choices: [
        { id: "don", label: "Erken dön", detail: "Çağrıyı duy, eşiği geçme.", effects: { beden: 4, sadakat: -4, nakit: -2 }, flag: "disarida" },
        { id: "otur", label: "Masaya otur", detail: "Bir akşam. Sadece dinle.", effects: { sadakat: 8, cesaret: 3 }, flag: "masa" },
        { id: "is", label: "Başka iş ara", detail: "Az para, temiz sabah.", effects: { nakit: 2, beden: 3, cesaret: 2 }, flag: "is" },
      ],
      check: {
        id: "esik",
        title: "Çağrının peşini bırakmaması",
        base: 0.48,
        weights: { sadakat: 0.004, cesaret: 0.003 },
        flagBias: { disarida: -0.18, masa: 0.12, is: -0.1 },
        lifestyleBias: { iceri: 0.08, kenar: -0.06 },
        hit: { prop: "lamp", log: "{name} eşiği geçmedi. {origin} o gece onu evde saydı." },
        miss: { prop: "street", effects: { sadakat: 6, nakit: 4 }, log: "Çağrı sürdü. {name} bir akşamı {origin} dışında tüketti." },
      },
    },
    {
      id: "gece",
      years: "20",
      title: "Kolay gece",
      hook: "Kolay para nakiti yükseltir, bedeni düşürür. Sağlam kapanış bedene bakar.",
      choices: [
        { id: "kalk", label: "Masadan kalk", detail: "Hikâye yarım kalsın.", effects: { beden: 6, nakit: -4, sadakat: -6 }, flag: "cikis" },
        { id: "kal", label: "Kal", detail: "Bir gece daha, hesabı sonra.", effects: { nakit: 10, beden: -8, sadakat: 4 }, flag: "kal" },
        { id: "uyar", label: "Birini uyar", detail: "Aynı yoldan çevir.", effects: { cesaret: 6, sadakat: -3 } },
      ],
      check: {
        id: "ucuz",
        title: "Gecenin ucuza kapanması",
        base: 0.5,
        weights: { beden: 0.005, cesaret: 0.002 },
        flagBias: { kal: -0.16, cikis: 0.14 },
        hit: { prop: "coin", log: "Gece bitti. {name} sabahı yorgun ama ayakta gördü." },
        miss: {
          prop: "crack",
          effects: { beden: -16, nakit: 6 },
          log: "Gece uzadı. Sabah bir eksilme vardı, bir de şişen cep.",
        },
      },
    },
    {
      id: "baski",
      years: "24",
      title: "Baskı",
      hook: "Sadakat yüksekse baskı da yüksek. Çıkış izi yüzdeyi rahatlatır.",
      choices: [
        { id: "borc", label: "Borcu kapat", detail: "Nakiti ver, bağı gevşet.", effects: { nakit: -10, sadakat: -6, beden: 4 } },
        { id: "sus", label: "Sus ve kal", detail: "Soru sorma.", effects: { sadakat: 8, cesaret: -4, beden: -4 }, flag: "sus" },
        { id: "kac", label: "Şehri değiştir", detail: "İsim aynı, sokak değil.", effects: { cesaret: 6, sadakat: -8, nakit: -4 }, flag: "cikis" },
      ],
      check: {
        id: "nefes",
        title: "Bir yıl nefes alabilmek",
        base: 0.44,
        weights: { beden: 0.004, cesaret: 0.003 },
        flagBias: { cikis: 0.12, sus: -0.1, masa: -0.06 },
        originBias: { tepe: -0.06, sahil: 0.04 },
        hit: { prop: "door", log: "{name} bir yıl kendi adına uyudu. {origin} geride kaldı." },
        miss: { prop: "street", effects: { beden: -8, sadakat: 4 }, log: "Baskı inmedi. {name} için {life} çizgisi daraldı." },
      },
    },
    {
      id: "kapi",
      years: "28",
      title: "Kapı",
      hook: "Kapı çalması bir sonuçtur. Beden ve çıkış izi, içeri alınma ihtimalini düşürür.",
      choices: [
        { id: "temiz", label: "Hesabı sadeleştir", detail: "Az eşya, az anlatı.", effects: { nakit: -6, cesaret: 4, beden: 3 } },
        { id: "sakla", label: "Eski bağa tutun", detail: "Seni korusunlar, san.", effects: { sadakat: 6, cesaret: -4 }, flag: "sus" },
        { id: "avukat", label: "Bir büyüğe sor", detail: "Kayıt, hak, sakin cümle.", effects: { cesaret: 5, nakit: -3, sadakat: -2 } },
      ],
      check: {
        id: "esik-kapi",
        title: "Kapının seni içeride tutmaması",
        base: 0.56,
        weights: { beden: 0.003, cesaret: 0.003 },
        flagBias: { kal: -0.14, cikis: 0.1, sus: -0.08 },
        lifestyleBias: { iceri: -0.1, kenar: 0.08 },
        hit: { prop: "lamp", log: "Kapı çalındı ve geçti. {name} eşiğin dışında kaldı." },
        miss: {
          prop: "seal",
          effects: { beden: -10, nakit: -8, cesaret: -4 },
          end: true,
          log: "Kapı bu kez açık kalmadı.",
          epitaph: "{name} bu sokak hayatını bir kaydın içinde kapattı. {origin} onu bir isim olarak tuttu.",
        },
      },
    },
    {
      id: "cikis-yili",
      years: "34",
      title: "Çıkış",
      hook: "Son eşik. Sadakat hâlâ yüksekse eski masa yüzdeyi aşağı çeker.",
      choices: [
        { id: "is-tut", label: "Bir tezgâh tut", detail: "Az kazanç, tekrar eden sabah.", effects: { nakit: 4, beden: 6, sadakat: -4 }, flag: "is" },
        { id: "aile", label: "Aileye dön", detail: "Anlatılmayanları anlatma.", effects: { beden: 5, cesaret: 3, sadakat: -2 } },
        { id: "eski", label: "Eski masaya bak", detail: "Bir kez daha.", effects: { sadakat: 8, beden: -8, nakit: 4 }, flag: "kal" },
      ],
      check: {
        id: "sabah",
        title: "Sıradan bir sabaha uyanmak",
        base: 0.5,
        weights: { beden: 0.004, cesaret: 0.002 },
        flagBias: { is: 0.12, cikis: 0.08, kal: -0.16 },
        hit: {
          prop: "star",
          end: true,
          log: "{name} sıradan bir sabaha uyandı.",
          epitaph: "{name} sokak hayatını bir tezgâhın arkasında kapattı. {origin} geride, beden yerinde.",
        },
        miss: {
          prop: "crack",
          end: true,
          effects: { beden: -18 },
          log: "Eski masa son kez ağır bastı.",
          epitaph: "Beden dayanamadı. {name} bu hayatı {origin} gecesinde, dönüşsüz kapattı.",
        },
      },
    },
  ],
};

export default pack;
