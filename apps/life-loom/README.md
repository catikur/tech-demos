# Life Loom

Bir meslek hayatı. Her yıl bir karar verirsin. Karar istatistikleri kaydırır. Yılın olayı, o istatistiklerden hesaplanan bir olasılıkla **tutar** ya da **kaçar**. Tutan ve kaçan her yıl, sahnedeki çokgen heykeli bir kat büyütür. Hayat kapanınca bunu bir infografik olarak indirebilirsin.

Beş hazır hayat: futbolcu, SAP danışmanı, basketbolcu, politikacı, sokak. Sokak paketi yalnızca bedeli anlatır; bir işin nasıl yapılacağını anlatmaz.

## Çalıştır

```sh
bun install
bun test
bun run dev
```

Anahtar yok.

## Yeni bir simülasyon

1. `src/data/careers/futbol.ts` dosyasını kopyala.
2. `id`, `role`, `stats`, `vital` alanlarını değiştir.
3. `origins` doğum yerini, `lifestyles` tarzı ağırlığıyla tarif etsin. `mods` başlangıç istatistiğini kaydırır.
4. Her `beats` kaydı bir yıldır. `choices` karardır. `check` o yılın olasılığıdır:
   - `base` bütün istatistikler 50 iken ihtimal
   - `weights` her puan için eklenen ihtimal (50'nin üstü artı, altı eksi)
   - `originBias`, `lifestyleBias`, `flagBias` yeri, tarzı ve önceki izi ekler
   - `hit` ve `miss` cümleyi, istatistik kaymasını ve heykele düşen `prop` şeklini söyler
   - `end: true` hayatı kapatır
5. Dosyayı `src/data/packs.ts` listesine ekle.

Motor (`src/engine/sim.ts`) meslek bilmez. Yüzde `8` ile `92` arasında kalır. Zar, yüzdenin altındaysa olay tutar.

## Kapsam

Özgün oyuncak. 1in8b.life'ın kodu, ülke tablosu ve metni yoktur. Oynanış fikri oradan okunmuştur: istatistikten olasılık, olasılıktan gerçekleşen yıl.
