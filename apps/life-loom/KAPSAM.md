# Life Loom — yapabilirlik planı

Bu belge oyunun bugünkü halini ve aynı motorun gidebileceği yeri birlikte tutar. Takvim yok. Her iz, bugünden başlayıp birbirini kilitlemeden derinleşir. Yatay eksen yeni bir kapı açar. Dikey eksen açık olan kapıyı kalınlaştırır.

## REA ile ilişki

Life Loom, REA’nın (Reverse Engineer Anything) yönteminden çıktı. Yöntem şuydu: herkese açık sitede davranışı izle, iddiayı kanıta bağla, mekanizmayı adlandır, kendi sistemini kur.

İzlenen yer [1in8b.life](https://1in8b.life/en/). Okunan şey sayfanın kendisi ve About metniydi: seçilmeyen doğum, yerin istatistiği, kararın ihtimali kaydırması, yılın tutması ya da kaçması, kayıt, kapanış, yanındaki başka bir hayat.

REA’nın kendi aracı çalıştırılmadı. Ghidra, Hopper, MCP ve o sitenin betiği yok. Ülke tablosu, cümleleri ve sayıları taşınmadı. tech-demos deposundaki `rea-lite` bu yöntemin arayüz demosudur ve orada kalır. Oyun bu depodadır.

Bundan sonrası da aynı yöntemle büyür: yeni bir davranışı gözle, motora bir iz olarak ekle, veriyi kendin yaz. Kaynak sökmek gerekmez. Asıl menzil, sökülmemiş kodda değil, bu motorun henüz açılmamış katmanlarındadır.

## Bugün çalışan

Bir meslek seçilir. Yer ve tarz, o mesleğin kısa listesinden ağırlıkla çekilir. İstatistikler 48’den başlar, yer ve tarz kaydırır. Her yıl bir karar istatistiği değiştirir. Ardından tek bir olay, `taban + (istatistik − 50) × ağırlık + yer + tarz + önceki iz` formülüyle bir yüzde üretir. Yüzde 8 ile 92 arasında kalır. Zar altındaysa olay tutar, üstündeyse kaçar. Tutan yıl heykeli renkli bir çokgenle büyütür. Kaçan yıl soluk bir iz bırakır. Hayat, son yılda, `end` işaretinde ya da hayati istatistik sıfırlanınca kapanır. Kapanış 1080×1440 PNG infografiktir.

Beş paket doludur. Her birinde beş yıl, üçer karar, bir olasılık ve iki sonuç vardır.

| Paket | Yerler | Tarz | Hayati istatistik |
| --- | --- | --- | --- |
| Futbolcu | Mahalle sahası, akademi, taşra kulübü | Kanat, ön libero, kaleci | Beden |
| SAP danışmanı | Anadolu ofisi, İstanbul merkez, yurtdışı proje | Finans, entegrasyon, çözüm mimarı | Tempo |
| Basketbolcu | Lise, park potası, yaz kampı | Gard, forvet, pivot | Atletizm |
| Politikacı | İlçe, sendika, ekran | Yerel, meclis, kampanya | Güven |
| Sokak | Sahil, tepe, çarşı | Kenarda, içeride | Beden |

Sokak paketi bedeli anlatır. Bir işin nasıl yapılacağını anlatmaz. Bu sınır kalır.

Bilerek olmayanlar: mesleksiz bir ömür, ülke çekilişi, gerçek nüfus ya da yaşam tablosu, yıl yıl seksen yaş, hesap, kayıtlı hayat, başkasının hayatıyla yan yana durma, paket editörü.

## İki eksen

Yatay izler aynı anda yürür. Birinin verisi diğerinin sahnesini beklemez. Dikey katmanlar tek bir izin içinde sıralıdır. Üst katman alttakinin sözleşmesini bozmaz.

Katmanlar her izde aynı anlama gelir.

| Katman | Anlamı |
| --- | --- |
| 0 | Bugün çalışan |
| 1 | Aynı motor, yeni veri |
| 2 | Motorun sözleşmesi genişler |
| 3 | Oyuncunun gördüğü zaman ve dünya değişir |
| 4 | Hayat kalır ve başkasına gider |

## 1. Doğum

Katman 0. Meslek seçilir. Yer ve tarz o listenin içinden çekilir.

Katman 1. Altıncı kart: **herhangi bir hayat**. Meslek yok. Yer, bir mahalle ya da kasaba listesidir. Yıllar okul, iş, bağ, sağlık, taşınma gibi genel perdelerdir. Aynı `Pack` sözleşmesi. Yeni dosya yeter.

Katman 2. Yer, ülkeye ya da bölgeye döner. Her yerin `weight` değeri doğum ya da nüfus payıdır. Cinsiyet, hane ve dönem (geçmiş, bugün, gelecek) ikinci ve üçüncü çekiliştir. Sayılar bizim yazdığımız tablodur. 1in8b tablosu kopyalanmaz. Kaynak kullanılacaksa atıf ve lisans paketin içine yazılır.

Katman 3. Doğum bir kayıt kartıdır. İsim, yer, hane, dönem ve “bu yerde bu yüzdeyle” satırı heykelin ilk halkası olur. Oyuncu ülkeyi seçemez.

Katman 4. Aynı tohum paylaşılır. Başkası aynı doğumu açar, kararları kendisi verir.

Paralel kapı: ülke listesi bir JSON dosyasıdır. Sahne ve paylaşım onu beklemez.

## 2. Olasılık

Katman 0. Yılda tek zar. Üç sebep ekranda.

Katman 1. Bir yılda birden fazla kontrol. Önce sağlık, sonra iş, sonra bağ. Her birinin kendi tabanı ve ağırlığı vardır. Biri diğerinin bayrağını o yıl içinde değiştirebilir.

Katman 2. Birikimli risk. Hayati istatistik her yıl küçük bir taban zar atar. Karar bu zarı kaydırır. Sıfır, o yıl kapanış nedeni olur. Yüzde hâlâ açıklanır.

Katman 3. Olay havuzu. Yılın tek sahnesi yoktur. Yer, yaş, tarz ve bayrak havuzdan süzgeçler. Kalanlar arasından ağırlık seçer, sonra yüzde zar atar. İçerik böyle çoğalır. Aynı insan aynı yaşta başka cümle görür.

Katman 4. Kalibrasyon. Yazar, paketi bin kez sessiz çalıştırır. Her olayın gerçekleşme payını görür. Tabanı buna göre indirir ya da kaldırır. Oyuncu bunu görmez. Yazar görür.

Paralel kapı: havuz ve kalibrasyon, 3B sahneden bağımsızdır. İkisi de `sim.ts` üstünde test edilir.

## 3. Zaman ve metin

Katman 0. Beş perde. Yaş etiketleri seyrektir. 16, 19, 23, 27, 34 gibi.

Katman 1. On iki perde. Çocukluk, eşik, ilk iş, orta, veda. Mesleksiz pakette bu dilim esastır. Meslek paketinde meslek, üçüncü perdeden sonra belirir. Doğum hâlâ mesleksizdir.

Katman 2. Yıl yıl. Seksen tur gerekmez. Oyuncunun önünde dönem vardır. İçeride her tur bir yıldır. Boş yıl da bir turdur: küçük risk, kısa cümle, heykelde ince bir halka.

Katman 3. Şablon. `{name}`, `{origin}`, `{life}` bugün var. Buna `{age}`, `{stat}`, `{other}` eklenir. Aynı olay üç cümle şablonu taşır. Tohum birini seçer.

Katman 4. Durak. 15, 30, 50 gibi yaşlarda zaman durur. Oyuncu bir satır yazar. Satır istatistiği değiştirmez. İnfografikte durur. İstenirse kapatılır.

Paralel kapı: metin şablonları sahne motifinden ayrı yazılır.

## 4. Görüntü

Katman 0. Tek figür, yer halkaları, yılda bir çokgen. Renk, yerin `hue` değeridir.

Katman 1. Meslek sahnesi. Futbol bir saha halkası, SAP bir masa, siyaset bir kürsü, sokak bir lamba. Motif paketin `stage` alanındadır. Figür aynı iskelet, kıyafet ve prop değişir.

Katman 2. Yaş. Perde ilerledikçe figürün boyu ve duruşu değişir. Çocukluk alçak, orta yaş geniş, kapanış yavaş. Kamera hayat uzadıkça yükselir. Bu bugün kısmen var. Yaş duruşu yok.

Katman 3. Karar anı. Seçim yapılınca heykel o prop’u büyütür, zar dönünce tuttuysa renklenir, kaçtıysa çatlar. Şimdi prop, sonuçtan sonra geliyor. Karar ile zar arasındaki nefes görsel olur.

Katman 4. Paylaşılan bakış. İnfografikteki fotoğraf bugün var. Üstüne, heykelin bir tur dönüşünün kısa ve sessiz kaydı eklenir. Hesap gerekmez. Dosya yerelde üretilir.

Paralel kapı: `world.tsx` paket metnini bilmez. Yalnızca `prop`, `hit`, `hue`, `age` alır.

## 5. Oynanış

Katman 0. Seç, zarı gör, sonraki yıl. İzle, kalanı kendisi bitirir.

Katman 1. Sıradaki yılın kancası, sonuçla birlikte görünür. “Formun yüksekse kadro genişler” bugün metindedir. Bunu bir sonraki yüzdenin tahmini olarak göstermek, devam etme nedenini sayıyla verir.

Katman 2. Tempo. Yavaş, normal, izle. Yavaşta zar çubuğu dolarken heykel döner. Karar her zaman durur. İzle, kararı da zarı da oynatır ama her sonucu bir an tutar.

Katman 3. İlişki ve para, kendi halkaları olarak durur. Meslek paketinde bugün dört istatistik var. Mesleksiz hayatta para, bağ ve beden ortak dildir. Meslek istatistiği, meslek başlayınca eklenir.

Katman 4. Bırak ve dön. Hayat tohumu ve karar listesi tarayıcıda durur. Aynı heykel kaldığı yaştan büyür.

Paralel kapı: tempo ve kayıt, yeni ülke verisini beklemez.

## 6. Kapanış

Katman 0. PNG. İsim, yer, tarz, neden, istatistik çubukları, her yılın yüzdesi, heykel fotoğrafı.

Katman 1. Neden satırı güçlenir. Son zar, hayati istatistik ve kapatan olay ayrı ayrı yazılır. “Tuttu / kaçtı” listesi yaş sırasını korur.

Katman 2. İkinci hayat. Aynı paket, başka tohum, sessiz oynanır. İnfografikte ince bir şerit: “aynı kuralla başka biri şöyle kapandı”. 1in8b’deki aynı saniye fikrinin tek kişilik hali.

Katman 3. Kartın adresi. PNG iner, ayrıca salt okunur bir sayfa açılır. Sayfa hesabı zorunlu tutmaz. İsteyen kartı yalnızca indirir.

Katman 4. Anıt. Kapanmış hayatlar, isimsiz bir rafta durur. Oyuncu bir satır bırakabilir. Satır oyunu değiştirmez.

Paralel kapı: kartın çizimi `share.ts` içindedir. Sahne yalnızca fotoğraf verir.

## 7. Yazarlık

Katman 0. `src/data/careers/*.ts` kopyalanır, `packs.ts` listesine eklenir.

Katman 1. JSON şema. TypeScript tipi ile aynı alanlar. Hatalı paket oyunu açmaz, eksik alanı söyler. Mevcut beş dosya şemaya göre doğrulanır.

Katman 2. Önizleme. Yazar bir olayı seçer. Form 20 ve form 90 için yüzdeyi yan yana görür. Bin koşunun tutma payını görür. Testler bugün bunun çekirdeğidir. Ekranı yoktur.

Katman 3. Tarayıcıda editör. Yer, tarz, yıl, karar, yüzde ağırlığı. Kaydetmek bir JSON indirir. Sunucuya yazmak şart değildir.

Katman 4. Paket rafı. JSON yüklenir, o oturumda oynanır. Başkasının paketi, senin motorunda çalışır. Sözleşme aynı kaldığı sürece motor güncellenmez.

Paralel kapı: şema ve önizleme, 3B işinden ayrı biter.

## 8. Kalıcılık

Katman 0. Sayfa yenilenince hayat gider.

Katman 1. Tarayıcı kaydı. Tohum, paket kimliği, verilen kararlar. Heykel bu listeden yeniden kurulur.

Katman 2. Dışa ve içe aktarma. Bir dosya. Başka tarayıcı aynı heykeli açar.

Katman 3. Hesap, isteğe bağlı. Hesapsız oyun katman 2’de tamdır. Hesap yalnızca rafı taşır.

Katman 4. Aile ağacı değil. Bir oyuncunun bitmiş hayatlarının listesi. Her kart kendi tohumudur.

Paralel kapı: kayıt formatı `{ packId, seed, choices[] }` kadardır. Yeni istatistik eklemek bu formatı bozmaz. Eski kayıt, o paketin o sürümüne kilitlenir.

## 9. Dürüstlük

Katman 0. Yüzde uydurulmaz. Ekrandaki sayı, zarın kullandığı sayıdır. Sokak paketi yöntem içermez.

Katman 1. Her paketin verisi ya bizim cümlemizdir ya da atıflı kamu verisidir. Karışık paket olmaz.

Katman 2. Ağır konular bir anahtarın arkasındadır. Kapalıyken o olay havuza girmez. Açıkken kapanış nedeni yine soyut kalır. Yardım satırı, o tür bir kapanışın kartında durur.

Katman 3. Üretilmiş cümle, şablondan geldiği için etiketlenir. Dışarıdan bir model bağlanırsa, o da kartta görünür. Model, yüzdeyi değiştiremez. Yalnızca cümle seçer.

Katman 4. Yaş kapısı. Sınıf modunda ağır havuz, paylaşım ve ödeme yoktur. Çekirdek oyun hesap istemez.

Bu iz diğerlerinin yanındadır. İçerik ve veri işi onu atlamaz.

## Paralel program

Aynı anda açılabilen beş iş. Birbirinin dosyasına yazmazlar.

| İş | Dokunduğu yer | Bitince oyuncu ne görür |
| --- | --- | --- |
| Herhangi bir hayat | `careers/herhangi.ts` | Altıncı kart, mesleksiz on iki perde |
| Ülke çekilişi | yeni `places.json` + doğum | Meslek seçilmeden önce bir yer düşer |
| Olay havuzu | `sim.ts` süzgeç | Aynı pakette tekrar oynayınca cümle değişir |
| Sahne seti | `world.tsx` | Ofis, saha, kürsü, sokak zemini |
| Kartın ikinci hayatı | `share.ts` | İnfografikte ince bir karşılaştırma şeridi |

Bunlar bitmeden başlayabilen ikinci dalga: tarayıcı kaydı, zar öncesi heykel nefesi, yazar önizlemesi, durak yaşları.

Birbirini bekleyen tek sıra şudur. Ülke listesi, mesleksiz hayatın yer alanına oturmadan dünya haritası gibi görünmez. Olay havuzu, beş perdelik dosyayı bozmadan eklenir. Eski paket, havuz boşsa bugünkü tek olayını kullanmaya devam eder.

## Dikey örnek

“Dünyanın herhangi bir yerinde, mesleği sonradan belli olan bir hayat” bugün yoktur. Aynı motorda şu sıra ile kurulur.

1. `herhangi` paketi, bugünkü sözleşme ile, on iki genel perde. Ülke yok. Bu, altıncı karttır.
2. Yer alanı ülkeye döner. Ağırlık doğum payıdır. İlk perde hâlâ geneldir.
3. Üçüncü perdeden sonra bir meslek kapısı açılır. Kapı, o ülkenin yazılmış paylarına ve oyuncunun istatistiğine bakar. SAP, futbol ya da hiçbiri çıkabilir. Meslek paketi o yaştan itibaren devralır. Önceki yıllar heykelde kalır.
4. Meslek çıkmazsa genel paket veda perdesine kadar gider.
5. Kapanış kartı ülkeyi, çıkan mesleği ve çıkmayan ihtimali yazar.

Bu örnek, yataydaki üç işi üst üste koyar: mesleksiz paket, ülke listesi, havuz. Sahne ve PNG aynı kalır.

## Sözleşme

Yeni bir hayat bu alanlardan fazlasını motordan isteyemez.

- `stats`, `vital`
- `origins[]` ağırlık, renk, başlangıç kayması
- `lifestyles[]` aynı biçimde
- `beats[]` kanca, kararlar, bir kontrol
- kontrol: `base`, `weights`, yer / tarz / iz sapması, `hit`, `miss`
- sonuç: cümle, istatistik, `prop`, isteğe bağlı `end`

Motor bunları okur. Ülke, havuz ve kayıt eklenince de paket, bu alanları taşımaya devam eder. Yeni alanlar isteğe bağlı olur. Eski beş paket yeniden yazılmaz.

## Bu depoda ilk iş

Sıra bağımlılığa göredir.

1. JSON şema ve mevcut beş paketin bu şemadan doğrulanması. Yazarlık kapısı açılır.
2. `herhangi` paketi. Mesleksiz on iki perde. Altıncı kart.
3. Tarayıcı kaydı. Tohum ve karar listesi. Heykel yenileyince geri gelir.
4. Sahne seti. Dört zemin. Figür yaşlandıkça boylanır.
5. Ülke listesi, kendi yazdığımız ağırlıklarla. Doğum, meslekten önce bir yer söyler.
6. Olay havuzu. Eski paketler tek olayla oynamaya devam eder.
7. İnfografikte ikinci tohumun şeridi.

REA demosu bu işlerin parçası değildir. O, tech-demos’ta kalır.
