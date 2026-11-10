# Life Loom

Altı perdelik, görsel bir hayat simülasyonu. Dünya bir veri paketidir: aynı motor Liman kasabasını da, bir yörünge bahçesini de oynatır. Üçüncü fikri kodu değiştirmeden eklersin.

Döngü, [1 in 8 Billion](https://1in8b.life/en/) sitesinin **herkese açık** oynanışından okundu: seçilmeyen bir doğum, yıl içindeki bir yön, ihtimali kaydıran kararlar, bir kayıt ve bir kapanış. Bu depo o sitenin kodunu, istatistiğini, ülke listesini ve cümlelerini içermez.

## Çalıştır

```sh
bun install
bun test
bun run dev
# → http://localhost:3000
```

Anahtar gerekmez.

## Nasıl oynanır

1. Bir dünya seç. Tezgâh, o dünyanın yer ağırlıklarını ve perdelerini gösterir.
2. **Bu dünyada doğ.** Yer ve hane ağırlığa göre çekilir.
3. Her perdede üç karttan birini seç. Kartın üstünde halkanın nasıl kayacağı yazar. Küçük bir zar ayrıca bir halkayı oynatır.
4. **Kalanını izle**, kararları senin yerine tamamlar.
5. Kapanış, hangi perdenin o sonu açtığını söyler. Aynı kuraldan gelen ikinci bir hayat yanda durur.

Tuşlar: `1` `2` `3`.

## Yeni bir hayat simülasyonu

`src/data/packs.ts` içine bir `Pack` daha koy. Motor şunları bilir, başka bir şey bilmez:

| Parça | Ne işe yarar | Nereye yazılır |
| --- | --- | --- |
| `places` | Doğum yeri. `weight` büyükse daha sık düşer. `hue` sahnenin rengidir. | paketin |
| `households` | Başlangıç halkası. Beden / neşe / bağ, 48 üstüne eklenir. | paketin |
| `stages` | Altı perde. Her birinde 2–3 `choices`. | paketin |
| `choices.effects` | Görünen kayma. Sonuç bu kadarla bitmez. | seçimin |
| `choices.flag` | Yapışkan iz. Kapanış kuralları buna bakar. | seçimin |
| `endings` | İlk uyan kural kazanır. Koşulsuz kural en sonda durur. | paketin |

`src/engine/sim.ts` dosyasına dokunmadan yeni dünya oynanır. İsim listesi, motif (`cradle`, `street`, `school`, `work`, `home`, `evening`, `pod`, `class`, `shift`, `voyage`, `found`, `star`) ve kapanış metni tamamen sana aittir.

## 1in8b’de görülen döngü, burada ne oldu

Herkese açık sayfa ve About metninden okunan karşılıklar:

- **Dünya ve tempo** (geçmiş / bugün / gelecek, 30–90 dk) → burada tempo yok. Bir hayat altı tık.
- **Doğum çekilişi** (doğum sayısına ya da nüfusa göre) → `weight`.
- **Yıllık odak + seyrek karar kartı** → her perde zaten bir karardır. Etki kartta görünür.
- **Dört gizli istatistik** → üç halka. Yüksek olan ihtimali artırır, sonu tek başına yazmaz.
- **Aynı saniyede doğanlar** → tek bir gölge hayat, başka tohum.
- **Otomatik mod** → Kalanını izle.
- **Ölüm kaydı** → temalı bir kapanış. Örnek dünyalarda ağır sahneler yok.

## Kapsam

Özgün oyuncak. Canlı Ghidra, Hopper, MCP ya da o sitenin betiği yok. Hayatlar tarayıcı belleğinde kalır; hesap yok.
