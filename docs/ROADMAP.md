# Harmonic Playlist — Ürün Yol Haritası

> Sürüm: 0.1.0 · Vizyon tarihi: 2027
> Bu belge; ürün kararlarını, teknik seçimleri, faz planını ve Spotify bağımlılığından doğan riskleri tek yerde toplar.

---

## 1. Vizyon

Harmonic Playlist, bir DJ'in "hangi şarkı sırada gelmeli?" sorusunu **tonal ve enerjetik olarak tutarlı** biçimde yanıtlayan bir masaüstü aracıdır.

Hedef kullanıcı:

- **Yarı profesyonel DJ** — haftada 1–3 set hazırlayan, Camelot bilen ama 40 şarkıyı elle sıralamaya vakti olmayan kişi.
- **Yeni başlayan DJ** — harmonik karıştırmayı öğrenen, "neden bu geçiş kötü?" sorusunun cevabını görmek isteyen kişi.
- **Radyo / podcast editörü** — 60–120 dakikalık, kesintisiz enerji akışı olan bir program kurgulayan kişi.

Başarı metrikleri:

| Metrik | Hedef |
| --- | --- |
| İlk setin üretilme süresi (200 şarkılık krate) | < 1.5 sn |
| Üretilen setin harmonik saflığı | ≥ %90 |
| Enerji eğrisi doğruluğu | ≥ %85 |
| Kullanıcının seti elle düzeltme oranı | < %20 |
| Çökmesiz oturum oranı | ≥ %99.5 |

---

## 2. Teknoloji kararı: Electron mu, Tauri mi?

### 2.1 Karşılaştırma

| Kriter | Electron 3x | Tauri 2 | Harmonic Playlist için anlamı |
| --- | --- | --- | --- |
| Paket boyutu | ~120–180 MB | ~5–12 MB | Tauri, indirme ve güncelleme maliyetinde 10× avantaj |
| Boşta bellek | ~150–250 MB | ~40–80 MB | DJ yazılımı yanında çalışacak; RAM kritik |
| Render motoru | Chromium (gömülü) | Sistem WebView (WKWebView / WebView2 / WebKitGTK) | Tauri'de Web Audio davranışı platformlar arası test gerektirir |
| Dil | JavaScript / TypeScript | Rust çekirdek + TS UI | Ekip Rust bilmiyorsa öğrenme maliyeti |
| Güvenlik | Node entegrasyonu geniş; dikkatli izolasyon gerekir | Capability tabanlı, varsayılan olarak kısıtlı | Token ve dosya erişimi için Tauri daha dar yüzey |
| OS keychain | `safeStorage` | `stronghold` / `keyring` | İkisi de mümkün |
| Otomatik güncelleme | `electron-updater` (olgun) | `tauri-plugin-updater` (olgun) | Eşit |
| Code signing | macOS notarization + Windows | macOS notarization + Windows | Eşit |
| Ekosistem | Çok geniş | Büyüyor | Electron lehine |
| Native ses / DSP | Node native modül / sidecar | Rust ile doğrudan | İleride yerel DSP için Tauri daha temiz |
| CI süresi | Yüksek | Orta | Tauri hafif |

### 2.2 Karar

**Tauri 2 + Rust önerilir.** Gerekçe:

1. Uygulamanın ağır işi zaten Web Worker'da; Chromium'a ihtiyaç yok.
2. Hedef kullanıcı, tarayıcı sekmesi yerine küçük ve hızlı bir masaüstü uygulaması bekler.
3. Gelecekteki yerel DSP (BPM/key analizi) Rust'ta daha verimli ve daha taşınabilir.
4. Token'lar OS keychain'inde tutulabilir; Spotify token'ı `localStorage`'da bırakmak uzun vadede kabul edilemez.

**Electron'a geçiş koşulu:** Ekip tamamen JavaScript ise veya Linux'ta WebKitGTK'ya bağlı kalmak istemiyorsa. Bu durumda aynı React arayüzü `electron-vite` ile 1–2 günde paketlenebilir; çekirdek kod değişmez.

### 2.3 Önerilen depo yapısı (masaüstü)

```text
harmonic-playlist/
├─ apps/
│  ├─ desktop/               # React UI (mevcut src/)
│  └─ web/                   # Opsiyonel tanıtım / demo
├─ packages/
│  ├─ core/                  # camelot, harmonic, bpm, energy, sequencer
│  ├─ spotify/               # auth + client + provider'lar
│  └─ ui/                    # paylaşılan bileşenler
├─ src-tauri/
│  ├─ src/
│  │  ├─ main.rs
│  │  ├─ oauth.rs            # loopback listener + token exchange
│  │  ├─ keychain.rs         # stronghold / keyring
│  │  └─ dsp.rs              # (Faz 5) BPM/key analizi
│  ├─ capabilities/default.json
│  ├─ icons/
│  └─ tauri.conf.json
├─ tests/
└─ docs/
```

Bugünkü tek paketli yapı, Faz 5'e kadar korunabilir. Monorepo'ya geçiş, masaüstü kabuğu eklenirken yapılmalıdır.

---

## 3. Mevcut durum (Faz 0–4)

| Alan | Durum | Not |
| --- | --- | --- |
| Camelot motoru | ✅ Tamam | 24 anahtar, referans tabloyla testli |
| Harmonik geçiş analizi | ✅ Tamam | Skor matrisi, çakışma, tritone sınırı |
| BPM analizi | ✅ Tamam | Half/double-time, pitch yüzdesi |
| Enerji profilleri | ✅ Tamam | 5 profil, krate'e yeniden ölçekleme |
| Beam search sequencer | ✅ Tamam | Deterministik, köprü ekleme |
| Worker'a taşıma | ✅ Tamam | Progress + fallback |
| UI / görsel sistem | ✅ Tamam | Cam + neon, 3 kolon, responsive |
| Camelot çarkı | ✅ Tamam | Rota, boncuklar, başlangıç/bitiş işaretleri |
| Zaman çizelgesi | ✅ Tamam | Enerji, BPM, hedef eğri |
| Sürükle-bırak | ✅ Tamam | Anlık yeniden puanlama |
| Web Audio önizleme | ✅ Tamam | Gerçek crossfade + synth fallback |
| Spotify PKCE | ✅ Tamam | Token yenileme, 401/429 |
| Özellik sağlayıcı | ⚠️ Kısmi | Spotify → ReccoBeats; yerel DSP yok |
| Playlist yayınlama | ✅ Tamam | Özel liste oluşturur |
| Krate ekranı | ✅ Tamam | Havuz görünürlüğü, filtre, sete ekleme |
| Harmonik Rotalar | ✅ Tamam | 5 aday rota, tek tıkla aktif |
| Analitik | ✅ Tamam | Histogramlar, sapma, kaynak dağılımı |
| Testler | ✅ 75 test | Motor + store + auth + entegrasyon |
| Hata sınırı | ✅ Tamam | ErrorBoundary + store hata bandı |
| Masaüstü kabuk | ✅ Tamam | Tauri 2, loopback OAuth, `.dmg` üretildi (Apple Silicon) |
| Windows kurulumu | ⚠️ CI hazır | `.exe`/`.msi` Windows runner'da üretiliyor |
| Kod imzalama / notarization | ⬜ Yok | Sertifika gerekli |
| OS keychain token | ⬜ Yok | Şu an `localStorage` |

---

## 4. Faz planı

### Faz 0 — Keşif ve risk analizi (tamamlandı)

- Spotify API kısıtlarının doğrulanması (`/audio-features`, `/recommendations` → 403).
- Camelot tablosunun referans DJ yazılımlarıyla eşleştirilmesi.
- Kullanıcı akışının kağıt üzerinde modellenmesi.
- Teknoloji karşılaştırması (bu belge).

**Çıktı:** Risk kaydı, veri modeli, teknik seçim.

### Faz 1 — Çekirdek motor (tamamlandı)

- Camelot dönüşümü ve ters dönüşüm.
- Harmonik uyumluluk matrisi.
- BPM katlama ve pitch hesabı.
- Enerji eğrileri ve krate'e yeniden ölçekleme.
- Beam search + köprü bulucu.
- Deterministik RNG (`mulberry32`).
- Birim testleri.

**Kabul:** `8A→9A`, `8A→8B`, `8A→10A` doğru sınıflanır; `8A→8A#` çakışma; aynı tohum aynı seti verir.

### Faz 2 — Arayüz ve etkileşim (tamamlandı)

- Cam/neon tasarım sistemi, anahtar bazlı renkler.
- 3D Camelot çarkı, rota çizimi, hover komşuluk vurgusu.
- Enerji/BPM zaman çizelgesi.
- Sürükle-bırak playlist ve anlık geçiş rozetleri.
- Geçiş paneli, QC raporu, transport bar.
- Responsive yerleşim (rail `xl`, sağ panel `lg`).
- `prefers-reduced-motion` desteği.

**Kabul:** 1440×900'de üç kolon; 1024'te iki kolon; 390px'te tek kolon ve yatay taşma yok.

### Faz 3 — Spotify entegrasyonu ve sağlayıcı katmanı (büyük ölçüde tamam)

- PKCE akışı, state doğrulama, token yenileme.
- Arama, toplu track çekme, 50'lik sayfalama.
- TTL'li önbellek (arama 12 saat, özellik 30 gün).
- ReccoBeats fallback.
- Playlist oluşturma ve şarkı ekleme.
- Tür → arama tohumları haritası.

**Kalanlar:**

- [ ] `FeatureProvider` arayüzünü açık bir sözleşmeye dönüştürmek (şu an `library.ts` içinde örtük).
- [ ] Pazar kodunu (`market: 'TR'`) ayarlanabilir yapmak.
- [ ] Spotify kullanıcı profili / çalma listesi seçimi.
- [ ] Token'ı keychain'e taşımak (Faz 5 ile birlikte).
- [ ] API hata mesajlarını kullanıcıya daha eyleme dönük göstermek (yeniden bağlan, kapsam eksik).

### Faz 4 — Ses ve performans (tamamlandı, iyileştirme sürüyor)

- AudioBuffer tabanlı 30 sn önizleme.
- Gerçek gain-ramp crossfade (4 sn, ayarlanabilir).
- Buffer LRU (12).
- Synth fallback: anahtar + BPM'e senkron pad.
- RMS metre.
- Worker'a taşınmış sıralama.
- `useMemo` ile çark/timeline hesaplarının sabitlenmesi.

**Kalanlar:**

- [ ] Uzun setlerde timeline sanallaştırması (200+ şarkı).
- [ ] `preview_url` yoksa alternatif yasal kaynak (kullanıcının yerel dosyaları).
- [ ] Ses çıkışı seçimi (cihaz listesi) — masaüstü kabuğunda.

### Faz 5 — Masaüstü paketleme ve yerel yetenekler (kabuk tamamlandı)

**Hedef:** Tauri 2 kabuğu, imzalı kurulum dosyaları, çevrimdışı krate, yerel DSP.

**Durum:** Kabuk, loopback OAuth, simgeler, DMG ve CI hazır. İmzalama, keychain ve yerel DSP açık.

Yapılanlar:

1. **Kabuk** ✅ `src-tauri/` — `productName: Harmonic Playlist`, `identifier: com.harmonicplaylist.desktop`, `frontendDist: "../dist"`, `devUrl: http://127.0.0.1:5199`.
2. **OAuth loopback** ✅ `oauth_callback_listener` (Rust) `127.0.0.1:8888` dinliyor; `tauri-plugin-opener` sistem tarayıcısını açıyor; kod IPC ile dönüyor. Token hâlâ `localStorage`'da.
3. **Paketleme** ✅ `npm run desktop:build:mac` → `.app` + `.dmg` (arm64 / Apple Silicon). Windows hedefi CI'da (`nsis` + `msi`).
4. **Simge** ✅ `src-tauri/app-icon.svg` → `npx tauri icon` ile tüm boyutlar.

Kalanlar:

- [ ] macOS Developer ID imzalama + `notarytool` notarization.
- [ ] Windows EV sertifikası / Azure Trusted Signing.
- [ ] Token'ı `stronghold`/`keyring` ile OS keychain'e taşımak.
- [ ] `tauri-plugin-sql` (SQLite) ile track/feature cache; `localStorage` yalnızca UI tercihleri.
- [ ] Yerel DSP: `symphonia` decode → `rustfft`/aubio ile BPM + chroma key, `source: 'local-dsp'`.
- [ ] `tauri-plugin-updater` + imzalı manifest.
- [ ] Linux `.AppImage` / `.deb`.

### Faz 6 — Yayın ve operasyon

- Kapalı beta (25 kullanıcı) → açık beta.
- Opt-in çökme raporu ve anonim kullanım metrikleri.
- Sürüm notları ve değişiklik günlüğü.
- Destek kanalı ve SSS.
- Spotify Developer Policy denetimi: önbellekleme, token saklama, ses indirme yasağı.
- Fiyatlandırma kararı (tek seferlik lisans mı, abonelik mi?) ve lisans anahtarı akışı.

---

## 5. Spotify API riskleri ve azaltma

| Risk | Etki | Olasılık | Azaltma |
| --- | --- | --- | --- |
| `/v1/audio-features` 403 (yeni uygulamalar) | Set üretimi durur | **Yüksek** | ReccoBeats fallback; yerel DSP; kullanıcıya net mesaj |
| `/v1/recommendations` 403 | Keşif kalitesi düşer | **Yüksek** | Tür + sanatçı arama tohumları; kullanıcı çalma listesi içe aktarma |
| `preview_url` sık `null` | Önizleme çalışmaz | Yüksek | Synth fallback; yerel dosya desteği |
| 429 rate limit | Gecikme / kısmi veri | Orta | `Retry-After`, önbellek, 50'lik toplu istekler |
| Extended quota gereksinimi | 25+ kullanıcıda ölçeklenememe | Orta | Erken başvuru; kullanıcı başına token (client credentials değil) |
| Developer Policy ihlali | Uygulama askıya alınır | Düşük/Orta | Ses indirmeme, önbelleği sınırlama, şeffaf izin ekranı |
| Token'ın `localStorage`'da olması | XSS'te token çalınması | Orta | CSP, keychain (Faz 5), kısa ömür + refresh rotasyonu |
| Pazar kısıtı (`market=TR`) | Bazı şarkılar bulunamaz | Düşük | Pazar ayarı |
| API şema değişikliği | Sessiz bozulma | Düşük | Sözleşme testleri, savunmacı normalizasyon |

### Politika notları

- Spotify içeriği **indirilemez** ve kalıcı ses olarak saklanamaz. Uygulama yalnızca 30 sn'lik resmi preview URL'lerini anlık çalar.
- Özellik verisi (BPM/key/energy) 30 gün önbelleklenir; bu, makul bir performans önbelleğidir, yeniden dağıtım değildir.
- Kullanıcı verisi üçüncü taraflara satılmaz; telemetri opt-in olmalıdır.
- Uygulama adı ve logosu Spotify markasını taklit etmemelidir; "Powered by Spotify" ibaresi ve marka kurallarına uyum gerekir.

---

## 6. QA / QC özeti

Ayrıntı: [`QC-PLAN.md`](QC-PLAN.md).

- **Birim:** Camelot dönüşümü, harmonik skorlar, BPM katlama, enerji eğrisi, metrikler.
- **Entegrasyon:** `planSet` uçtan uca; determinizm; köprü ekleme; profil farkları; sürükle-bırak sonrası `rebuildPlan`.
- **Görsel/manüel:** 390 / 768 / 1024 / 1440 genişlikleri; klavye odak halkaları; kontrast; reduced motion.
- **Performans:** 200 şarkıda planlama < 1.5 sn; ana thread uzun görev < 50 ms; çark etkileşimi 60 fps.
- **Dayanıklılık:** Worker çökmesi, 401, 429, bozuk preview, boş krate, eksik key.

---

## 7. Sonraki iki sprint (öneri)

### Sprint A — Sağlayıcı sağlamlaştırma

- [ ] `FeatureProvider` arayüzünü `services/features/` altına taşı.
- [ ] Spotify, ReccoBeats ve `ManualProvider` için sözleşme testleri.
- [ ] Pazar seçimi ve dil/para birimi ayarları.
- [ ] Spotify hata mesajlarını eyleme dönük hale getir.
- [ ] Keychain soyutlaması için arayüz (web'de `localStorage`, masaüstünde Rust).

### Sprint B — Masaüstü dikey dilim

- [ ] `src-tauri` iskeleti + `tauri build` CI'da.
- [ ] Loopback OAuth ve keychain.
- [ ] SQLite krate önbelleği.
- [ ] İmzalı macOS DMG + Windows NSIS.
- [ ] Otomatik güncelleme manifesti.

---

## 8. Açık sorular

1. Kullanıcı kendi yerel dosyalarını içe aktarabilsin mi? (Rekabet avantajı yüksek, DSP maliyeti de.)
2. Setler buluta senkronize edilsin mi? (Gizlilik ve maliyet dengesi.)
3. Çoklu krate / koleksiyon yönetimi gerekli mi?
4. Spotify dışı kaynaklar (SoundCloud, Apple Music) kapsama alınacak mı? (API olgunluğu düşük.)
5. Ücret modeli: tek seferlik mi, yıllık mı?
6. Set dışa aktarma: M3U, Rekordbox XML, Serato crate?
