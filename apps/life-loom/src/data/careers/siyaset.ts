import type { Pack } from "../../engine/sim.ts";

const pack: Pack = {
  id: "siyaset",
  name: "Politikacı",
  role: "politikacı",
  pitch: "Söz odayı açar, güven onu tutar. İtibar bir yüzdedir, alkış değil.",
  names: ["Leyla", "Emre", "Sevgi", "Tarık", "Nil", "Hakan"],
  vital: "guven",
  stats: [
    { key: "soz", label: "Söz" },
    { key: "ag", label: "Ağ" },
    { key: "guven", label: "Güven" },
    { key: "kasa", label: "Kasa" },
  ],
  origins: [
    { id: "ilce", name: "İlçe örgütü", weight: 5, hue: 350, blurb: "Çay, liste, kapı kapı ziyaret.", mods: { ag: 8, kasa: -4 } },
    { id: "sendika", name: "Sendika", weight: 3, hue: 12, blurb: "Kalabalık salon, net talep.", mods: { soz: 4, guven: 6 } },
    { id: "ekran", name: "Ekran", weight: 2, hue: 220, blurb: "Kısa cümle, geniş yüz, ince güven.", mods: { soz: 8, guven: -6, kasa: 4 } },
  ],
  lifestyles: [
    { id: "yerel", name: "Yerel", weight: 4, blurb: "Mahalle, belediye, tanıdık isim.", mods: { ag: 6 } },
    { id: "meclis", name: "Meclis", weight: 3, blurb: "Sıra, önerge, az kamera.", mods: { soz: 4, guven: 4 } },
    { id: "kampanya", name: "Kampanya", weight: 2, blurb: "Afiş, miting, hızlı kasa.", mods: { kasa: 6, guven: -4 } },
  ],
  beats: [
    {
      id: "kursu",
      years: "29",
      title: "İlk kürsü",
      hook: "İlk konuşma güveni ya kurar ya yer. Söz yüksekse oda büyür.",
      choices: [
        { id: "kisa", label: "Kısa konuş", detail: "Bir talep, bir cümle.", effects: { soz: 6, guven: 4 } },
        { id: "sert", label: "Sert çık", detail: "Alkış gelir, köprü gider.", effects: { soz: 8, guven: -6, ag: -2 }, flag: "sert" },
        { id: "dinle", label: "Önce dinle", detail: "Mikrofonu geciktir.", effects: { ag: 7, guven: 3 } },
      ],
      check: {
        id: "oda",
        title: "Odanın seni ciddiye alması",
        base: 0.46,
        weights: { soz: 0.005, guven: 0.004, ag: 0.003 },
        originBias: { ekran: 0.06, ilce: 0.04 },
        hit: { prop: "mic", effects: { ag: 6 }, log: "{name} kürsüden inince {origin} onu bir sonraki listeye sordu." },
        miss: { prop: "crack", effects: { guven: -6 }, log: "Salon kibardı, kimse numara istemedi." },
      },
    },
    {
      id: "aday",
      years: "34",
      title: "Adaylık",
      hook: "Liste, ağ ve kasa birlikte yazılır. Biri eksikse yüzde düşer.",
      choices: [
        { id: "kapi", label: "Kapı kapı", detail: "Yavaş, hatırlanan, yorucu.", effects: { ag: 8, guven: 4, kasa: -2 } },
        { id: "bagis", label: "Bağış gecesi", detail: "Kasa şişer, soru da.", effects: { kasa: 10, guven: -6 }, flag: "kasa" },
        { id: "ekip", label: "Ekibini kur", detail: "Sen konuş, onlar gezsin.", effects: { ag: 5, soz: 4 } },
      ],
      check: {
        id: "liste",
        title: "Aday listesine girmek",
        base: 0.4,
        weights: { ag: 0.006, kasa: 0.003, guven: 0.003 },
        lifestyleBias: { yerel: 0.06, kampanya: 0.04 },
        hit: { prop: "podium", effects: { soz: 4 }, log: "{name} listede. {life} yolu artık bir rozet." },
        miss: { prop: "door", effects: { guven: -4 }, log: "Liste kapandı. {name} bir dönem daha {origin} kahvesinde." },
      },
    },
    {
      id: "itibar",
      years: "39",
      title: "İtibar",
      hook: "Güven bir haberle erir. Kasa izi varsa yüzde daha kırılgan.",
      choices: [
        { id: "acik", label: "Hesabı aç", detail: "Rakamlar masada.", effects: { guven: 8, kasa: -3 } },
        { id: "sus", label: "Sessiz kal", detail: "Fırtına diner, soru kalır.", effects: { guven: -4, soz: -2 }, flag: "sus" },
        { id: "ozur", label: "Özrü net söyle", detail: "Kısa, tek, tekrar yok.", effects: { guven: 5, soz: 4 } },
      ],
      check: {
        id: "haber",
        title: "Güvenin habere dayanması",
        base: 0.52,
        weights: { guven: 0.006, soz: 0.002 },
        flagBias: { kasa: -0.14, sus: -0.08, sert: -0.04 },
        hit: { prop: "seal", log: "Haber çıktı, {name} ayakta kaldı. Güven eksildi ama bitmedi." },
        miss: {
          prop: "crack",
          effects: { guven: -18, ag: -6 },
          log: "Bir haber {name} için odayı boşalttı.",
          epitaph: "Güven bitti. {name} bu siyaset hayatını bir manşetin altında kapattı.",
        },
      },
    },
    {
      id: "ittifak",
      years: "44",
      title: "İttifak",
      hook: "Masa, ağın kadar geniş. Sözün sertse yerin daralır.",
      choices: [
        { id: "uzlas", label: "Uzlaş", detail: "Bir madde ver, iki madde al.", effects: { ag: 6, soz: -2, guven: 3 } },
        { id: "yalniz", label: "Yalnız çık", detail: "İttifak yok, mesele net.", effects: { soz: 6, ag: -6, guven: 2 }, flag: "yalniz" },
        { id: "genc", label: "Genci öne al", detail: "Liste gençleşsin.", effects: { guven: 5, ag: 4 } },
      ],
      check: {
        id: "masa",
        title: "Masada yerinin kalması",
        base: 0.48,
        weights: { ag: 0.006, guven: 0.003 },
        flagBias: { yalniz: -0.12, sert: -0.06 },
        hit: { prop: "flag", effects: { ag: 6 }, log: "{name} masada kaldı. {life} çizgisi bir ortak cümleye girdi." },
        miss: { prop: "door", effects: { ag: -8 }, log: "Masa daraldı. {name} koridorda kendi listesini tuttu." },
      },
    },
    {
      id: "donem",
      years: "52",
      title: "Dönem sonu",
      hook: "Son seçim değil, son izleniş. Güven yüksekse veda da seçilir.",
      choices: [
        { id: "devret", label: "Devret", detail: "Koltuğu adlandırarak bırak.", effects: { guven: 6, ag: 4 } },
        { id: "sonkez", label: "Son kez aday ol", detail: "Bir dönem daha.", effects: { soz: 4, guven: -4, kasa: -2 } },
        { id: "yaz", label: "Yaz", detail: "Konuşma değil, kayıt.", effects: { soz: 6, guven: 4 } },
      ],
      check: {
        id: "veda",
        title: "Vedanın ciddiye alınması",
        base: 0.5,
        weights: { guven: 0.005, soz: 0.003, ag: 0.002 },
        hit: {
          prop: "star",
          end: true,
          log: "Salon ayağa kalktı, kısa süre.",
          epitaph: "{name} bu siyaset hayatını kendi cümlesiyle kapattı. {origin} onu bir dönemle anar.",
        },
        miss: {
          prop: "lamp",
          end: true,
          log: "Veda bültene sığdı.",
          epitaph: "{name} sahneden indi. Alkış kısaydı. {life} yılları dosyada kaldı.",
        },
      },
    },
  ],
};

export default pack;
