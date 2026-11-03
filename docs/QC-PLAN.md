# Harmonic Playlist — QA / QC Planı

> Amaç: harmonik iddiayı **kanıtlanabilir** kılmak. "Kulağa hoş geliyor" yeterli değil; her kural bir testle veya tekrarlanabilir bir manuel kontrolle eşleşmeli.

---

## 1. Test piramidi

```text
            ┌──────────────────────────────┐
            │  Manuel keşif + görsel QC    │  ~45 dk / sürüm
            ├──────────────────────────────┤
            │  Uçtan uca (planSet)         │  15 test
            ├──────────────────────────────┤
            │  Entegrasyon (rebuildPlan,   │
            │  bridge, provider, store)    │  ~22 test
            ├──────────────────────────────┤
            │  Birim (camelot, harmonic,   │  ~33 test
            │  bpm, energy)                │
            └──────────────────────────────┘
```

Mevcut durum: **70 test / 5 dosya**, tümü geçiyor.

| Dosya | Test | Kapsam |
| --- | --- | --- |
| `tests/camelot.test.ts` | 9 | 24 anahtar dönüşümü, ters dönüşüm, parse, çark geometrisi, renk yardımcıları |
| `tests/harmonic.test.ts` | 24 | İlişki skorları, çakışma, tritone, eksik metadata, geçiş notları, QC ihlalleri, komşuluk |
| `tests/bpm.test.ts` | 10 | Birebir, küçük düzeltme, beatmatch, red, half/double-time, bozuk metadata |
| `tests/sequencer.test.ts` | 15 | Uçtan uca üretim, determinizm, BPM penceresi, enerji eğrisi, köprü, boş krate, sürükle-bırak sonrası yeniden hesap |
| `tests/views.test.ts` | 12 | Krate filtresi, janra sayımı, `setPlan`, `appendTrack` (tekrar/boş plan), rota adaylarının farklılaşması, sertliğin saflığa etkisi |

Çalıştırma:

```bash
npm test                 # tek sefer
npm run test:watch       # geliştirme
npm run test:coverage    # kapsam
```

---

## 2. Referans doğruluk tablosu

Bu tablo, testlerin ve manuel QC'nin **altın standardıdır**. Herhangi bir DJ yazılımıyla (Rekordbox, Serato, Mixed In Key) eşleşmelidir.

| Camelot | Müzik | Spotify key / mode |
| --- | --- | --- |
| 1A | A♭ min | 8 / 0 |
| 1B | B maj | 11 / 1 |
| 5A | C min | 0 / 0 |
| 5B | E♭ maj | 3 / 1 |
| 8A | A min | 9 / 0 |
| 8B | C maj | 0 / 1 |
| 10B | D maj | 2 / 1 |
| 12A | C♯ min | 1 / 0 |

Kabul kriterleri:

- `spotifyToCamelot(9, 0)` → `8A`
- `spotifyToCamelot(0, 1)` → `8B`
- `camelotToSpotify({number: 5, letter: 'A'})` → `{key: 0, mode: 0}`
- Tüm 24 anahtar için gidiş-dönüş birebir olmalı.

---

## 3. Harmonik kabul kriterleri

| Kural | Beklenen | Test |
| --- | --- | --- |
| Aynı anahtar | 100, uyumlu | `scores the same key as perfect` |
| +1 / −1 | 96 / 94, uyumlu | `accepts ±1 ...` |
| Relatif | 90, uyumlu | `accepts the relative major/minor` |
| ±2 | 74 / 70, uyumlu | `treats ±2 ...` |
| Yarım ton | 10, uyumsuz, `clash=true` | `flags a semitone move as a clash` |
| Triton | ≤ 26 | `caps tritone movement` |
| Mode-shift | 34, uyumsuz | `marks off-wheel fifth shifts ...` |
| Metadata yok | 50, uyumlu | `never blocks when metadata is missing` |
| Geçiş notu | S/A/B/C/D eşikleri | `gives an S grade ...` |
| BPM cezası | Anahtar perfect olsa bile not düşer | `penalises a tempo jump ...` |
| Çakışma | BPM ne olursa olsun uyumsuz | `never calls a clashing pair compatible` |

### Üretilen set kabulü

- İstenen sayıda şarkı (krate yeterliyse).
- **Sıfır** anahtar çakışması.
- Tekrar eden şarkı yok.
- Tüm BPM'ler istenen pencerede (±%6 tolerans).
- `harmonicPurity ≥ %90` (demo krate'te tipik olarak %100).
- Aynı tohum → aynı sıra; farklı tohum → farklı rota.
- Boş krate çökmez; `NOT_ENOUGH_TRACKS` uyarısı verir.

---

## 4. Manuel QC kontrol listesi

Her sürüm adayında (release candidate) uygulanır. İşaretleme: ✅ geçti · ❌ kaldı · ⚠️ kabul edilebilir sapma.

### 4.1 İlk açılış

- [ ] Uygulama kimlik bilgisi olmadan açılıyor ve 40 şarkılık set üretiyor.
- [ ] İlk set < 1.5 sn içinde görünüyor.
- [ ] Seçili şarkı otomatik olarak 1. sıraya geliyor; çark, geçiş paneli ve QC dolu.
- [ ] Konsolda hata veya uyarı yok (React key uyarıları dahil).

### 4.2 Set üretimi

- [ ] Tür çipleri tek tek seçilip kaldırılabiliyor; krate sayısı güncelleniyor.
- [ ] BPM min/max sürgüleri birbirini geçemiyor (min < max).
- [ ] Şarkı sayısı 8–80 arasında değiştirilebiliyor.
- [ ] Beş akış profilinin her biri farklı bir eğri üretiyor.
- [ ] Harmonik katılık arttıkça daha az ama daha güvenli geçişler oluşuyor.
- [ ] "Geçiş köprüsü" kapatıldığında bridge rozeti görünmüyor.
- [ ] `⌘/Ctrl + Enter` yeni set üretiyor; üretim sırasında ikinci kez basmak yeni istek açmıyor.
- [ ] Yetersiz krate'te uyarı görünüyor ve set istenen sayıdan küçük oluyor (çökmüyor).

### 4.3 Çark ve zaman çizelgesi

- [ ] Çarkta rota, oynatılan şarkı sırasına göre çiziliyor.
- [ ] Her şarkı için bir boncuk var; seçili boncuk beyaz ve büyük.
- [ ] Başlangıç yeşil halka, bitiş beyaz halka ile işaretli.
- [ ] Bir anahtara hover edince yalnızca komşuları parlak kalıyor.
- [ ] Kullanılan anahtara tıklamak o anahtardaki bir sonraki şarkıyı seçiyor.
- [ ] Zaman çizelgesinde enerji, BPM ve hedef eğri ayrı okunabiliyor.
- [ ] Timeline yatay kaydırılabiliyor; seçili nokta vurgulu.
- [ ] 40 şarkıda çark etkileşimi akıcı (gözle 60 fps).

### 4.4 Playlist ve sürükle-bırak

- [ ] Satıra tıklamak seçimi, çark merkezini ve geçiş panelini güncelliyor.
- [ ] Satır içi oynat düğmesi önizlemeyi başlatıyor; ikinci tıklama duraklatıyor.
- [ ] Sürükle-bırak sonrası geçiş rozetleri **anında** yeniden hesaplanıyor.
- [ ] Sürükle-bırak sonrası QC metrikleri ve çark rotası güncelleniyor.
- [ ] `bridge` rozeti yalnızca köprü olarak eklenen şarkıda görünüyor.
- [ ] C/D notlu geçişe tıklamak köprü önerisini ekliyor (varsa).
- [ ] Silme düğmesi şarkıyı kaldırıyor; son şarkı silinince boş durum görünüyor.
- [ ] Arama kutusu başlık, sanatçı ve Camelot kodu ile filtreliyor.
- [ ] Arama sonucu yoksa anlaşılır mesaj görünüyor.

### 4.5 Ses

- [ ] İlk oynatma kullanıcı etkileşimiyle başlıyor (autoplay engeli yok).
- [ ] Şarkı değişiminde gerçek crossfade duyuluyor (4 sn).
- [ ] Crossfade süresi 0 sn'ye çekilince geçiş sertleşiyor.
- [ ] Ses seviyesi ve mute çalışıyor; RMS metre hareket ediyor.
- [ ] `preview_url` olmayan demo şarkıda synth pad çalıyor.
- [ ] Bozuk/expired preview URL'sinde ses kesilmiyor, synth'e düşüyor.
- [ ] Duraklat/devam zaman çizgisini doğru koruyor.
- [ ] Sekme arka plana alınınca çalma makul davranıyor (suspend/resume).

### 4.6 Görsel ve responsive

- [ ] 1440×900: üç kolon, tüm paneller görünür, dikey kaydırma yok.
- [ ] 1280×800: üç kolon, taşma yok.
- [ ] 1024×768: iki kolon; sağ panel gizli; playlist tam genişlik.
- [ ] 768×1024: iki kolon veya tek kolon; yatay kaydırma yok.
- [ ] 390×844: tek kolon; çark ve timeline okunabilir; dokunma hedefleri ≥ 40 px.
- [ ] Uzun şarkı/albüm adları `truncate` ile taşmıyor.
- [ ] Neon renkler koyu zeminde WCAG AA kontrastı sağlıyor (metin için ≥ 4.5:1).
- [ ] `prefers-reduced-motion: reduce` açıkken float/dash animasyonları duruyor.
- [ ] Klavye ile tüm düğmelere ulaşılıyor; odak halkası görünür.
- [ ] Ekran okuyucu çarkı "Camelot Wheel" olarak duyuruyor; düğmelerin `aria-label`'ı var.

### 4.7 Hata ve dayanıklılık

- [ ] Spotify yapılandırılmamışken "Bağla" akışı anlaşılır hata veriyor.
- [ ] `localhost` ile açıldığında modal, `127.0.0.1` uyarısını gösteriyor ve giriş düğmesini kilitliyor.
- [ ] Redirect URI origin'i uygulamanın origin'iyle eşleşmezse PKCE uyarısı görünüyor.
- [ ] Giriş sonrası üst çubuk yeniden yükleme olmadan **Spotify bağlı** durumuna geçiyor; avatar profil fotoğrafını veya baş harfleri gösteriyor (sabit "M" yok).
- [ ] Çıkış yapınca üst çubuk ve avatar yeniden bağlantısız duruma dönüyor.
- [ ] Premium olmayan hesapta `/me` 403 döndüğünde modal anlaşılır uyarı gösteriyor, demo mod bozulmuyor.
- [ ] Geçersiz `state` ile dönen OAuth reddediliyor.
- [ ] Süresi dolmuş token otomatik yenileniyor; kullanıcı yeniden girişe zorlanmıyor.
- [ ] 429 yanıtında istek bekleyip tekrar deniyor (ağ panelinden doğrula).
- [ ] Worker çökertildiğinde hata bandı görünüyor ve sonraki üretim çalışıyor.
- [ ] Render hatası ErrorBoundary tarafından yakalanıyor; "Tekrar dene" çalışıyor.
- [ ] localStorage dolu iken uygulama çökmüyor (cache temizliği).
- [ ] Ağ kapalıyken demo modu tam çalışıyor.

### 4.8 Spotify akışı (credential varsa)

- [ ] Giriş sonrası kullanıcı adı/avatar görünüyor.
- [ ] Tür seçimi gerçek krate yüklüyor; kaynak rozeti `spotify`/`reccobeats`.
- [ ] `/audio-features` 403 dönerse ReccoBeats'e düşüyor.
- [ ] Her iki sağlayıcı da başarısızsa açıklayıcı hata görünüyor.
- [ ] Playlist yayınlama özel liste oluşturuyor ve URL dönüyor.
- [ ] Demo şarkılar playlist'e eklenmiyor.

### 4.9 Krate / Harmonik Rotalar / Analitik

**Navigasyon**

- [ ] Sol raydaki dört düğme (Set Builder, Krate, Harmonik Rotalar, Analitik) gerçekten ekran değiştiriyor; hiçbiri dekoratif değil.
- [ ] Aktif düğmede yeşil kenar çizgisi ve neon parıltı var; `aria-current="page"` set edilmiş.
- [ ] `1`–`4` tuşları ilgili ekranı açıyor; bir input alanına yazarken tetiklenmiyor.
- [ ] `xl` altındaki genişliklerde ray gizleniyor ve üstteki yatay sekme şeridi aynı ekranları açıyor.
- [ ] Ekran değiştirip geri dönünce aktif set, seçili şarkı ve oynatma durumu korunuyor.

**Krate (`CrateView`)**

- [ ] Başlıkta `havuzdaki / toplam` sayısı doğru (demo: seçili janraya göre 65 / 190 gibi).
- [ ] Janra çipleri birleşim (union) olarak filtreliyor; "Tümü" hepsini geri getiriyor.
- [ ] Ton dağılımı hücresine tıklamak listeyi o anahtara filtreliyor; tekrar tıklamak/`X` kaldırıyor.
- [ ] Arama başlık, sanatçı, albüm ve Camelot kodu ile eşleşiyor; büyük/küçük harf duyarsız.
- [ ] Sıralama düğmeleri (BPM / Enerji / Key / A-Z) listeyi anında yeniden diziyor.
- [ ] Sette olan satırlarda `sette` rozeti var ve `+` düğmesi pasif; olmayanlarda `+` setin sonuna ekliyor.
- [ ] Sette olmayan bir satırın önizleme düğmesi devre dışı ve tooltip nedeni açıklıyor.
- [ ] Aynı şarkı ikinci kez eklenmeye çalışılınca `zaten sette` uyarısı çıkıyor, set bozulmuyor.
- [ ] Plan yokken ekleme denemesi `Önce bir set üret` uyarısı veriyor.
- [ ] Filtre hiçbir şarkı bırakmazsa boş durum metni görünüyor (boş beyaz alan değil).

**Harmonik Rotalar (`RoutesView`)**

- [ ] "Rotaları hesapla" beş aday üretiyor; düğme hesaplama sırasında spinner gösterip kilitleniyor.
- [ ] Kartlar ortalama geçiş puanına göre azalan sırada; `#1` en iyi.
- [ ] Her kartta saflık, ortalama geçiş, enerji doğruluğu, not dağılımı çubuğu ve rota şeridi gerçek plan değerlerinden geliyor.
- [ ] "Kusursuz" kartının saflığı "Cesur" kartından düşük değil.
- [ ] "Bu rotayı kullan" aktif planı değiştiriyor; kart `aktif` rozetini alıyor ve Set Builder'a dönünce playlist yeni sırayı gösteriyor.
- [ ] Aktif kartın düğmesi pasif; ikinci kez tıklanamıyor.
- [ ] Krate/janra/profil değiştirildikten sonra "eski yapılandırma" uyarısı çıkıyor ve yeniden hesaplama onu kaldırıyor.
- [ ] Rota şeridindeki bir çubuğa tıklamak o şarkıyı çalıyor/seçiyor.
- [ ] Krate 4'ten azsa hesaplama düğmesi devre dışı.

**Analitik (`AnalyticsView`)**

- [ ] Plan yokken boş durum ekranı görünüyor; set üretildikten sonra dolu geliyor.
- [ ] Altı KPI (saflık, ortalama geçiş, enerji doğruluğu, en uzun seri, BPM drift, ton yayılımı) QC panelindeki değerlerle birebir aynı.
- [ ] Not dağılımı çubuklarının toplamı `şarkı sayısı − 1` geçişe eşit.
- [ ] Ton histogramı hücresine tıklamak o anahtarın ilk geçtiği şarkıyı seçiyor.
- [ ] BPM histogramı kovaları setin gerçek min–max aralığını kapsıyor; hedef aralık metni doğru.
- [ ] Enerji sapması çubukları yeşil/sarı/kırmızı ayrımına uyuyor; çubuğa tıklamak ilgili şarkıyı seçiyor.
- [ ] Sanatçı tekrarı listesi `artistCooldown` üstündeki sanatçıları vurguluyor.
- [ ] Veri kaynakları dağılımı demo'da `Demo`, Spotify'da `Spotify`/`ReccoBeats` gösteriyor.
- [ ] "Sorunlu geçişler" listesi yalnızca uyumsuz geçişleri içeriyor; satıra tıklamak o şarkıyı seçiyor; hiç yoksa yeşil "tüm geçişler uyumlu" kutusu çıkıyor.
- [ ] Sürükle-bırak veya şarkı silme sonrası tüm analitik değerleri yeniden hesaplanıyor (bayat değer kalmıyor).

### 4.10 Masaüstü kurulum (macOS `.dmg` / Windows `.exe`)

**macOS**

- [ ] `Harmonic Playlist_0.1.0_aarch64.dmg` açılıyor, sürükle-bırak ile `/Applications`'a kuruluyor.
- [ ] İlk açılışta Gatekeeper uyarısı çıkıyor; **System Settings → Privacy & Security → Open Anyway** ile açılıyor.
- [ ] Pencere başlığı `Harmonic Playlist`; trafik ışıkları içerikle çakışmıyor, üst çubuk sürüklenebiliyor.
- [ ] Pencere yeniden boyutlandırılınca üç kolon düzeni bozulmuyor; playlist en az 5 satır gösteriyor.
- [ ] Uygulama internet olmadan açılıyor ve demo seti üretiyor.
- [ ] Spotify girişi sistem tarayıcısını açıyor; `127.0.0.1:8888` callback'i "Giriş tamamlandı" sayfasını gösteriyor ve uygulama oturumu alıyor.
- [ ] Tarayıcı sekmesi kapatılsa bile uygulama kilitlenmiyor; port 8888 doluysa anlaşılır hata veriyor.
- [ ] `.dmg` içindeki uygulama sürümü `package.json` / `tauri.conf.json` ile aynı.

**Windows**

- [ ] `Harmonic Playlist_0.1.0_x64-setup.exe` çalıştırılıyor; kullanıcı başına kurulum, masaüstü kısayolu ve kaldırma girdisi oluşuyor.
- [ ] WebView2 yoksa kurulum gerekli çalışma zamanını yönlendiriyor veya uygulama açılışta anlaşılır hata veriyor.
- [ ] Kurulum sonrası uygulama açılıyor, demo seti üretiliyor.
- [ ] Spotify girişi varsayılan tarayıcıda açılıyor; `127.0.0.1:8888` callback'i yakalanıyor.
- [ ] Pencere küçültme/büyütme ve yüksek DPI'da metinler bulanıklaşmıyor.
- [ ] Kaldırma (uninstall) sonrası kısayol ve kayıt girdisi temizleniyor.

**Ortak**

- [ ] Masaüstü build'i `npm run desktop:build` ile yeniden üretilebiliyor; CI artefaktıyla aynı sürüm.
- [ ] İmzasız build olduğu bilinen sorunlar listesinde yazılı (macOS Gatekeeper, Windows SmartScreen).

---

## 5. Performans bütçeleri

| Ölçüm | Bütçe | Nasıl ölçülür |
| --- | --- | --- |
| İlk anlamlı boyama (dev) | < 1.5 sn | Lighthouse / Performance panel |
| Production JS (gzip) | < 150 kB | `npm run build` çıktısı |
| Production CSS (gzip) | < 20 kB | aynı |
| 200 şarkılık `planSet` | < 1.5 sn | `PlanResult.elapsedMs` |
| Ana thread uzun görev | < 50 ms | Performance panel |
| Çark hover/click | 60 fps | Performance panel |
| Timeline kaydırma | 60 fps | Performance panel |
| Bellek (30 dk oturum) | < 300 MB | Chrome Memory / heap snapshot |
| Preview başlatma gecikmesi | < 400 ms | `play()` çağrısından ses duyulana kadar |

Ölçüm protokolü:

1. Production build (`npm run build && npm run preview`).
2. Soğuk önbellek (`localStorage.clear()`), 4× CPU throttle.
3. 3 kez ölç, medyanı al.
4. Bütçe aşılırsa release blocker.

---

## 6. Tarayıcı / platform matrisi

| Platform | Sürüm | Durum |
| --- | --- | --- |
| Chrome / Edge | son 2 | Birincil hedef |
| Safari (macOS) | son 2 | Web Audio ve `decodeAudioData` doğrulanmalı |
| Firefox | son 2 | `AudioContext` farkları |
| Tauri (WKWebView) | macOS 13+ | Birincil masaüstü hedef — `.dmg` doğrulandı (imzasız) |
| Tauri (WebView2) | Windows 10+ | `.exe`/`.msi` CI'da üretiliyor; manuel smoke test bekliyor |
| Tauri (WebKitGTK) | Ubuntu 22.04+ | Henüz paketlenmiyor; ses codec desteği doğrulanmalı |
| Mobil Safari / Chrome | son 2 | Yalnızca görsel/okunabilirlik; tam DJ akışı hedef değil |

---

## 7. CI hattı

```yaml
# .github/workflows/ci.yml (öneri)
name: ci
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

Release hattı (Faz 5):

1. `typecheck` + `test` + `build`.
2. `tauri build` (macOS / Windows / Linux matrisi).
3. İmzalama ve notarization.
4. Artefaktları yükle, SHA-256 manifesti üret.

> Mevcut `.github/workflows/desktop-build.yml` 2. adımı karşılıyor: `v*` etiketinde veya manuel tetiklemede macOS universal `.dmg` ile Windows `nsis` + `msi` üretip artefakt olarak yüklüyor. 3. adım (imzalama) secret'lar girilene kadar atlanıyor.
5. Updater manifestini imzala ve yayınla.
6. Smoke test: temiz sanal makinede kur → aç → demo set üret.

---

## 8. Hata önem dereceleri

| Seviye | Tanım | Örnek | SLA |
| --- | --- | --- | --- |
| **P0** | Veri kaybı, güvenlik açığı, uygulama açılmıyor | Token sızıntısı, beyaz ekran | Aynı gün |
| **P1** | Ana akış kırık | Set üretilemiyor, ses çalmıyor | 48 saat |
| **P2** | Önemli ama geçici çözüm var | Spotify krate boş, bridge eklenmiyor | 1 hafta |
| **P3** | Kozmetik | Hizalama, renk tonu, uzun metin taşması | Sonraki sürüm |

Release blocker: açık **P0 veya P1** yok + tüm otomatik testler yeşil + manuel kontrol listesinde kritik maddeler işaretli.

---

## 9. Güvenlik kontrol listesi

- [ ] Repoda client secret, token veya kişisel veri yok.
- [ ] `.env` `.gitignore` içinde; `.env.example` yalnızca anahtar adları içeriyor.
- [ ] OAuth `state` doğrulaması zorunlu.
- [ ] PKCE `S256` kullanılıyor; `plain` yok.
- [ ] Token `expires_at` hesabı 30 sn güvenlik payı içeriyor.
- [ ] Dış URL'ler (`preview_url`, artwork) yalnızca `https` ve bilinen alan adlarından.
- [ ] CSP production'da `default-src 'self'`; Spotify ve CDN alan adları açıkça listeli.
- [ ] `dangerouslySetInnerHTML` kullanılmıyor.
- [ ] Bağımlılık denetimi: `npm audit --omit=dev` kritik açık vermiyor.
- [ ] Paketlenmiş sürümde token OS keychain'inde (Faz 5).

---

## 10. Bilinen test boşlukları

Bunlar bilinçli olarak ertelendi; Faz 5–6'da kapatılmalı:

1. **Gerçek Spotify sandbox testi** — CI'da credential yok; manuel yapılıyor.
2. **Ses çıkışı doğrulaması** — otomasyon yok; kulakla + RMS ile.
3. **Erişilebilirlik otomasyonu** — axe/Lighthouse CI'a eklenmedi.
4. **Görsel regresyon** — Playwright screenshot diff yok.
5. **Yerel DSP doğruluğu** — henüz kod yok; referans dosya setiyle test edilecek.
6. **Uzun süreli bellek testi** — 2 saatlik set çalma senaryosu.
7. **Platformlar arası Web Audio** — Safari/Firefox farkları manuel.

---

## 11. Sürüm kabul kapısı (release gate)

Bir sürüm yayınlanabilir ancak ve ancak:

- [ ] `npm run typecheck`, `npm test`, `npm run build` yeşil.
- [ ] Manuel QC listesinin **kritik** maddeleri (4.1, 4.2, 4.4, 4.7) tamam.
- [ ] 4.9 (Krate / Rotalar / Analitik) ve 4.10 (masaüstü kurulum) maddeleri tamam.
- [ ] Performans bütçeleri aşılmıyor.
- [ ] Açık P0/P1 yok.
- [ ] Sürüm notları ve bilinen sorunlar yazıldı.
- [ ] macOS + Windows'ta temiz kurulum smoke testi geçti.
- [ ] Spotify Developer Policy kontrolü yapıldı (ses indirme yok, önbellek sınırlı).
