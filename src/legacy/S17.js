/**
 * 小手机 - 音乐APP v3.0
 * 
 * 核心逻辑：
 * - queue: 当前播放队列
 * - queueIndex: 当前播放索引
 * - favorites: 收藏列表（持久化）
 * - history: 播放历史（持久化）
 * 
 * audio元素在父窗口，关闭手机继续播放
 */

(function () {
    'use strict';

    function waitForPhoneSystem(cb) {
        if (window.parent.PhoneSystem) {
            cb();
        } else {
            setTimeout(function () { waitForPhoneSystem(cb); }, 100);
        }
    }

    waitForPhoneSystem(function () {
        console.log('[音乐APP] 初始化 v3.0');

        // ============ 配置 ============
        var APP_ID = 'music';
        var STORAGE_KEY = 'phone_music_v3';
        var AUDIO_ID = 'phone-music-audio';

        // ============ 主题 ============
        // ============ 主题 (iOS Apple Music Style) ============
        // ============ 主题 ============
        var T = {
            primary: '#ff7e5f', // Coral/Orange gradient start
            gradient: 'linear-gradient(135deg, #ff7e5f 0%, #feb47b 100%)', // Sunset gradient
            dark: '#2c3e50',
            bg: '#f8f9fa',
            card: '#ffffff',
            text: '#333333',
            textLight: '#999999',
            heart: '#ff4757',
            tabBg: 'rgba(255,255,255,0.95)'
        };

        // ============ SVG图标 ============
        // ============ SVG图标 (SF Symbols Style) ============
        // ============ 图标 (Remix Icon) ============
        var I = {
            back: '<i class="ri-arrow-left-line" style="font-size:24px"></i>',
            search: '<i class="ri-search-line" style="font-size:20px"></i>',
            play: '<i class="ri-play-fill" style="font-size:32px"></i>',
            pause: '<i class="ri-pause-fill" style="font-size:32px"></i>',
            prev: '<i class="ri-skip-back-fill" style="font-size:24px"></i>',
            next: '<i class="ri-skip-forward-fill" style="font-size:24px"></i>',
            heart: '<i class="ri-heart-line" style="font-size:24px"></i>',
            heartFill: '<i class="ri-heart-fill" style="font-size:24px;color:#ff4757"></i>',
            list: '<i class="ri-play-list-line" style="font-size:24px"></i>',
            down: '<i class="ri-arrow-down-s-line" style="font-size:32px"></i>',
            music: '<img src="https://api.iconify.design/ri:netease-cloud-music-fill.svg?color=white" style="width:100%;height:100%">',
            queue: '<i class="ri-play-list-line" style="font-size:22px"></i>',
            x: '<i class="ri-close-line" style="font-size:24px"></i>',
            stop: '<i class="ri-stop-circle-line" style="font-size:24px"></i>',
            home: '<i class="ri-home-4-line" style="font-size:24px"></i>',
            discover: '<i class="ri-compass-3-line" style="font-size:24px"></i>',
            modeLoop: '<i class="ri-repeat-line" style="font-size:20px"></i>',
            modeOne: '<i class="ri-repeat-one-line" style="font-size:20px"></i>',
            modeShuffle: '<i class="ri-shuffle-line" style="font-size:20px"></i>',
            backToDesk: '<i class="ri-home-fill" style="font-size:22px"></i>'
        };

        // ============ 全局音频 ============
        var audio = window.parent.document.getElementById(AUDIO_ID);
        if (!audio) {
            audio = window.parent.document.createElement('audio');
            audio.id = AUDIO_ID;
            audio.style.display = 'none';
            window.parent.document.body.appendChild(audio);
        }

        // ============ 状态 ============
        var state = {
            currentSong: null,
            isPlaying: false,
            queue: [],
            queueIndex: -1,
            queueName: '',
            favorites: [],
            history: [],
            playMode: 0 // 0: 列表循环, 1: 单曲循环, 2: 随机播放
        };

        var doc = null;
        var searchCache = [];
        var lyrics = [];
        var currentTab = 'home';

        // ============ 持久化 ============
        function load() {
            try {
                var s = localStorage.getItem(STORAGE_KEY);
                if (s) {
                    var d = JSON.parse(s);
                    state.favorites = d.favorites || [];
                    state.history = d.history || [];
                    state.currentSong = d.currentSong || null;
                    state.queue = d.queue || [];
                    state.queueIndex = typeof d.queueIndex === 'number' ? d.queueIndex : -1;
                    state.queueName = d.queueName || '';
                }
            } catch (e) {
                console.error('加载状态失败', e);
            }
        }

        function save() {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify({
                    favorites: state.favorites,
                    history: state.history.slice(0, 50),
                    currentSong: state.currentSong,
                    queue: state.queue,
                    queueIndex: state.queueIndex,
                    queueName: state.queueName
                }));
            } catch (e) {
                console.error('保存状态失败', e);
            }
        }

        load();

        if (audio.src && !audio.paused) {
            state.isPlaying = true;
        }

        // ============ HTTP ============
        function httpGet(url) {
            return new Promise(function (resolve) {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, true);
                xhr.timeout = 10000;
                xhr.onload = function () {
                    try { resolve(JSON.parse(xhr.responseText)); }
                    catch (e) { resolve(null); }
                };
                xhr.onerror = function () { resolve(null); };
                xhr.ontimeout = function () { resolve(null); };
                xhr.send();
            });
        }

        // ============ 工具函数 ============
        function isFav(id) {
            return state.favorites.some(function (s) { return s.id === id; });
        }

        function toggleFav(song) {
            var i = state.favorites.findIndex(function (s) { return s.id === song.id; });
            if (i >= 0) {
                state.favorites.splice(i, 1);
            } else {
                state.favorites.unshift(song);
            }
            save();
            refreshFavBtns();
        }

        function addToHistory(song) {
            state.history = state.history.filter(function (s) { return s.id !== song.id; });
            state.history.unshift(song);
            if (state.history.length > 50) {
                state.history = state.history.slice(0, 50);
            }
            save();
        }

        function refreshFavBtns() {
            if (!doc) return;
            var btns = doc.querySelectorAll('[data-fav]');
            btns.forEach(function (b) {
                var id = parseInt(b.dataset.fav);
                b.innerHTML = isFav(id) ? I.heartFill : I.heart;
            });
        }

        function formatTime(s) {
            if (!s || isNaN(s)) return '0:00';
            var m = Math.floor(s / 60);
            var sec = Math.floor(s % 60);
            return m + ':' + (sec < 10 ? '0' : '') + sec;
        }

        // ============ 播放控制 ============
        function playSong(song, context, contextName, indexInContext) {
            state.currentSong = song;
            state.isPlaying = true;

            if (context && context.length > 0) {
                state.queue = context.slice();
                state.queueIndex = indexInContext || 0;
                state.queueName = contextName || '';
            }

            addToHistory(song);
            save();
            updateUI();

            var idParam = song.mid ? 'mid=' + song.mid : 'id=' + song.id;
            httpGet('https://api.vkeys.cn/v2/music/tencent?' + idParam).then(function (res) {
                if (res && res.data && res.data.url) {
                    audio.src = res.data.url;
                    audio.play().catch(function (e) { console.log('播放失败:', e); });
                    fetchLyrics(song.mid || song.id);
                } else {
                    if (window.parent.toastr) {
                        window.parent.toastr.warning('VIP歌曲，跳过');
                    }
                    playNext();
                }
            });
        }

        function togglePlay() {
            if (!state.currentSong) return;
            if (state.isPlaying) {
                audio.pause();
            } else {
                audio.play();
            }
        }

        function toggleMode() {
            state.playMode = (state.playMode + 1) % 3;
            var modeName = ['列表循环', '单曲循环', '随机播放'][state.playMode];
            if (window.parent.toastr) window.parent.toastr.info('播放模式: ' + modeName);
            updateUI();
        }

        function playNext(auto) {
            if (state.queue.length === 0) return;

            // 单曲循环且自动播放结束时
            if (auto && state.playMode === 1) {
                audio.currentTime = 0;
                audio.play();
                return;
            }

            // 随机播放
            if (state.playMode === 2) {
                var nextIndex = Math.floor(Math.random() * state.queue.length);
                // 尽量不重复
                if (state.queue.length > 1 && nextIndex === state.queueIndex) {
                    nextIndex = (nextIndex + 1) % state.queue.length;
                }
                state.queueIndex = nextIndex;
            } else {
                // 列表循环
                state.queueIndex = (state.queueIndex + 1) % state.queue.length;
            }

            var song = state.queue[state.queueIndex];
            playSong(song, state.queue, state.queueName, state.queueIndex);
        }

        function playPrev() {
            if (state.queue.length === 0) return;

            // 随机播放时上一首也随机 (或者基于历史，这里简单处理)
            if (state.playMode === 2) {
                var nextIndex = Math.floor(Math.random() * state.queue.length);
                state.queueIndex = nextIndex;
            } else {
                state.queueIndex = (state.queueIndex - 1 + state.queue.length) % state.queue.length;
            }

            var song = state.queue[state.queueIndex];
            playSong(song, state.queue, state.queueName, state.queueIndex);
        }

        function playFromQueue(index) {
            if (index < 0 || index >= state.queue.length) return;
            state.queueIndex = index;
            var song = state.queue[index];
            playSong(song, state.queue, state.queueName, index);
        }

        function stopMusic() {
            audio.pause();
            audio.src = '';
            state.currentSong = null;
            state.isPlaying = false;
            state.queue = [];
            state.queueIndex = -1;
            save();
            updateUI();
        }

        function seekTo(pct) {
            if (!audio.duration) return;
            audio.currentTime = (pct / 100) * audio.duration;
        }

        // ============ 歌词 ============
        function fetchLyrics(id) {
            lyrics = [];
            if (!doc) return;
            var el = doc.getElementById('lyric');
            if (el) el.textContent = '♪ 加载歌词...';

            httpGet('https://api.vkeys.cn/v2/music/tencent/lyric?mid=' + id).then(function (res) {
                if (res && res.data && res.data.lyric) {
                    var lines = res.data.lyric.split('\n');
                    var re = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
                    lines.forEach(function (line) {
                        var matches = [];
                        var match;
                        while ((match = re.exec(line)) !== null) {
                            matches.push(match);
                        }
                        re.lastIndex = 0;
                        var text = line.replace(re, '').trim();
                        if (matches.length && text) {
                            matches.forEach(function (m) {
                                lyrics.push({
                                    time: parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / 1000,
                                    text: text
                                });
                            });
                        }
                    });
                    lyrics.sort(function (a, b) { return a.time - b.time; });
                    if (el && lyrics.length) el.textContent = lyrics[0].text;
                    else if (el) el.textContent = '♪ 暂无歌词';
                } else if (el) {
                    el.textContent = '♪ 暂无歌词';
                }
            }).catch(function () {
                if (el) el.textContent = '♪ 暂无歌词';
            });
        }

        function updateLyric(time) {
            if (!lyrics.length || !doc) return;
            var el = doc.getElementById('lyric');
            if (!el) return;
            var cur = lyrics[0];
            for (var i = lyrics.length - 1; i >= 0; i--) {
                if (time >= lyrics[i].time) {
                    cur = lyrics[i];
                    break;
                }
            }
            if (cur && el.textContent !== cur.text) {
                el.textContent = cur.text;
            }
        }

        // ============ UI更新 (iOS Style) ============
        function updateUI() {
            if (!doc) return;

            var song = state.currentSong;
            var hasSong = !!song;

            var mini = doc.getElementById('mini');
            var content = doc.getElementById('content');
            if (mini) mini.style.display = hasSong ? 'flex' : 'none';
            // Adjust padding: 50px (Tab Bar) + 64px (Mini Player) = 114px
            if (content) content.style.paddingBottom = hasSong ? '114px' : '50px';

            if (hasSong) {
                setById('mini-title', song.name);
                // setById('mini-artist', song.singer); // Removed from mini player in new design
                setImgById('mini-cover', song.cover);
                setHtmlById('mini-play', state.isPlaying ? I.pause : I.play);

                setById('full-title', song.name);
                setById('full-artist', song.singer);
                setImgById('full-cover', song.cover);
                setBgById('full-bg', song.cover);
                setHtmlById('full-play', state.isPlaying ? I.pause : I.play);

                // Mode Icon
                var modeIcon = state.playMode === 1 ? I.modeOne : (state.playMode === 2 ? I.modeShuffle : I.modeLoop);
                var modeColor = state.playMode === 0 ? T.textLight : T.primary; // 列表循环置灰，其他高亮
                var modeBtn = doc.getElementById('mode-btn');
                if (modeBtn) {
                    modeBtn.innerHTML = modeIcon;
                    modeBtn.style.color = modeColor;
                }

                var favBtn = doc.getElementById('full-fav');
                if (favBtn) {
                    favBtn.dataset.fav = song.id;
                    favBtn.innerHTML = isFav(song.id) ? I.heartFill : I.heart;
                }

                setById('queue-info', state.queueName ? state.queueName.toUpperCase() : 'PLAYING FROM LIBRARY');
            }
        }

        function setById(id, val) {
            var e = doc.getElementById(id);
            if (e) e.textContent = val;
        }

        function setHtmlById(id, val) {
            var e = doc.getElementById(id);
            if (e) e.innerHTML = val;
        }

        function setImgById(id, val) {
            var e = doc.getElementById(id);
            if (e) e.src = val;
        }

        function setBgById(id, val) {
            var e = doc.getElementById(id);
            if (e) e.style.backgroundImage = "url('" + val + "')";
        }

        function updateProgress() {
            if (!audio.duration || !doc) return;
            var pct = (audio.currentTime / audio.duration) * 100;

            var miniProg = doc.getElementById('mini-prog');
            var fill = doc.getElementById('prog-fill');
            var thumb = doc.getElementById('prog-thumb');
            var cur = doc.getElementById('time-cur');
            var total = doc.getElementById('time-total');

            if (miniProg) miniProg.style.width = pct + '%';
            if (fill) fill.style.width = pct + '%';
            if (thumb) {
                thumb.style.left = pct + '%';
                // Show thumb only when manipulating or playing? iOS shows it.
                // We keep it hidden in CSS by default opacity:0? No, let's make it visible here if needed or keep it simple.
                // In genHTML I set opacity:0. Let's make it visible if playing?
                // Actually Apple Music slider thumb is usually visible.
                thumb.style.opacity = '1';
            }
            if (cur) cur.textContent = formatTime(audio.currentTime);
            if (total) total.textContent = formatTime(audio.duration);

            updateLyric(audio.currentTime);
        }

        // ============ 搜索 ============
        var searchKeyword = '';
        var searchPage = 1;
        var hasMoreResults = false;

        function search(kw, page) {
            if (!kw || !doc) return;
            var content = doc.getElementById('content');
            if (!content) return;

            searchKeyword = kw;
            searchPage = page || 1;

            if (searchPage === 1) {
                content.innerHTML = '<div style="padding:40px 20px;text-align:center"><div style="font-size:32px;animation:spin 1s linear infinite;opacity:0.5">⏳</div></div>';
                searchCache = [];
            }

            // 使用专用搜索API，支持分页
            httpGet('https://api.vkeys.cn/v2/music/tencent/search/song?word=' + encodeURIComponent(kw) + '&page=' + searchPage + '&num=30').then(function (res) {
                if (!res || !res.data || res.data.length === 0) {
                    if (searchPage === 1) {
                        content.innerHTML = '<div style="padding:60px 20px;text-align:center"><div style="font-size:48px;opacity:0.1;margin-bottom:10px">�</div><div style="color:' + T.textLight + ';font-size:15px">No Results Found</div></div>';
                    }
                    hasMoreResults = false;
                    return;
                }

                // 处理结果
                var newSongs = [];
                res.data.forEach(function (item) {
                    newSongs.push(item);
                });

                newSongs = newSongs.map(function (item) {
                    var singerStr = '未知歌手';
                    if (typeof item.singer === 'string') {
                        singerStr = item.singer;
                    } else if (Array.isArray(item.singer)) {
                        singerStr = item.singer.map(function (s) { return s.name || s; }).join('/');
                    }

                    var cover = item.cover;
                    if (!cover && item.albummid) {
                        cover = 'https://y.qq.com/music/photo_new/T002R300x300M000' + item.albummid + '.jpg';
                    }
                    if (!cover) cover = 'https://via.placeholder.com/100';

                    return {
                        id: item.id || item.mid,
                        mid: item.mid,
                        name: item.song || item.songname || item.name || '未知歌曲',
                        singer: singerStr,
                        cover: cover
                    };
                });

                // 合并到缓存
                searchCache = searchCache.concat(newSongs);
                hasMoreResults = newSongs.length >= 30;

                renderSearchResults();
            });
        }

        function renderSearchResults() {
            if (!doc || !searchCache.length) return;
            var content = doc.getElementById('content');
            if (!content) return;

            var songs = searchCache;
            var title = '搜索: ' + searchKeyword;

            var html = '<div style="padding:20px 20px 120px">';
            html += '<div style="display:flex;align-items:center;margin-bottom:20px">';
            html += '<div id="back-home" style="cursor:pointer;color:' + T.primary + ';margin-right:8px;display:flex;align-items:center;font-size:17px;font-weight:500">' + I.back + ' <span style="transform:translateY(-1px)">返回</span></div>';
            html += '</div>';

            html += '<h2 style="font-size:28px;font-weight:700;color:' + T.text + ';margin:0 0 20px;letter-spacing:-0.5px">最佳匹配</h2>';

            // List Style
            html += '<div style="display:flex;flex-direction:column;gap:0">';
            songs.forEach(function (s, i) {
                var isActive = state.currentSong && state.currentSong.id === s.id;
                html += '<div class="song-item touch-active" data-type="search" data-idx="' + i + '" style="display:flex;align-items:center;gap:16px;padding:12px 0;border-bottom:0.5px solid rgba(0,0,0,0.05);cursor:pointer;position:relative">';
                html += '<img src="' + s.cover + '" style="width:50px;height:50px;border-radius:8px;object-fit:cover;background:#eee;flex-shrink:0">';
                html += '<div style="flex:1;min-width:0">';
                html += '<div style="font-weight:500;font-size:16px;color:' + (isActive ? T.primary : T.text) + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px">' + s.name + '</div>';
                html += '<div style="font-size:14px;color:' + T.textLight + '">' + s.singer + '</div>';
                html += '</div>';
                if (isActive) {
                    html += '<div style="width:16px;color:' + T.primary + '">♬</div>';
                }
                html += '<div data-fav="' + s.id + '" style="cursor:pointer;display:flex;padding:8px;color:' + T.textLight + '" onclick="event.stopPropagation()">' + (isFav(s.id) ? I.heartFill : I.heart) + '</div>';
                html += '</div>';
            });
            html += '</div>';

            if (hasMoreResults) {
                html += '<div id="load-more" style="text-align:center;padding:20px;color:' + T.textLight + ';cursor:pointer;font-size:14px;font-weight:500">加载更多...</div>';
            }
            html += '</div>';

            content.innerHTML = html;

            // Bind events
            var backBtn = doc.getElementById('back-home');
            if (backBtn) backBtn.addEventListener('click', function () { switchTab('home'); });

            var loadMoreBtn = doc.getElementById('load-more');
            if (loadMoreBtn) {
                loadMoreBtn.addEventListener('click', function () {
                    loadMoreBtn.textContent = 'Loading...';
                    search(searchKeyword, searchPage + 1);
                });
            }

            var items = doc.querySelectorAll('.song-item');
            items.forEach(function (el) {
                el.onclick = function () {
                    var idx = parseInt(el.dataset.idx);
                    playSong(songs[idx], songs, '搜索: ' + searchKeyword, idx);
                };
            });

            bindFavBtns(songs);
        }


        // ============ 渲染视图 ============
        function renderSongList(songs, title, type) {
            if (!doc) return;
            var content = doc.getElementById('content');
            if (!content) return;

            var html = '<div style="padding:20px 20px 120px">';

            if (type === 'search') {
                // Should call renderSearchResults usually, but simplistic fallback
            }

            html += '<h2 style="font-size:32px;font-weight:800;color:' + T.text + ';margin:0 0 24px;letter-spacing:-1px">' + title + '</h2>';

            if (songs.length === 0) {
                html += '<div style="text-align:center;padding:60px 0;color:' + T.textLight + '">暂无歌曲</div>';
            } else {
                html += '<div id="play-all" style="background:' + T.card + ';color:' + T.primary + ';padding:14px;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:24px">' + I.play + ' 播放全部</div>';
            }

            // List
            html += '<div style="display:flex;flex-direction:column">';
            songs.forEach(function (s, i) {
                var isActive = state.currentSong && state.currentSong.id === s.id;
                html += '<div class="song-item touch-active" data-type="' + type + '" data-idx="' + i + '" style="display:flex;align-items:center;gap:16px;padding:12px 0;border-bottom:0.5px solid rgba(0,0,0,0.05);cursor:pointer">';
                html += '<img src="' + s.cover + '" style="width:48px;height:48px;border-radius:6px;object-fit:cover;background:#eee" onerror="this.src=\'https://via.placeholder.com/48\'">';
                html += '<div style="flex:1;min-width:0">';
                html += '<div style="font-weight:500;font-size:16px;color:' + (isActive ? T.primary : T.text) + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + s.name + '</div>';
                html += '<div style="font-size:14px;color:' + T.textLight + '">' + s.singer + '</div>';
                html += '</div>';
                html += '<div data-fav="' + s.id + '" style="cursor:pointer;display:flex;padding:8px;color:' + T.textLight + '" onclick="event.stopPropagation()">' + (isFav(s.id) ? I.heartFill : I.heart) + '</div>';
                html += '</div>';
            });
            html += '</div>'; // list end

            html += '</div>'; // padding end
            content.innerHTML = html;

            var playAllBtn = doc.getElementById('play-all');
            if (playAllBtn && songs.length > 0) {
                playAllBtn.addEventListener('click', function () {
                    playSong(songs[0], songs, title, 0);
                });
            }

            var items = doc.querySelectorAll('.song-item');
            items.forEach(function (el) {
                el.onclick = function () {
                    var idx = parseInt(el.dataset.idx);
                    playSong(songs[idx], songs, title, idx);
                };
            });

            bindFavBtns(songs);
        }

        function renderHome() {
            if (!doc) return;
            var content = doc.getElementById('content');
            if (!content) return;

            var colors = ['#f23d4e,#9e1b29', '#3e51b5,#283593', '#009688,#00695c', '#ff9800,#ef6c00', '#9c27b0,#6a1b9a'];
            var keywords = ['周杰伦', 'Taylor Swift', 'K-Pop', 'Anime', 'Billie Eilish'];

            var html = '<div style="padding:20px 20px 100px">';

            // Section 1: Browse / Quick Search
            html += '<h3 style="font-size:22px;font-weight:700;margin:10px 0 16px;color:' + T.text + '">浏览分类</h3>';
            html += '<div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:10px;margin:0 -20px 20px;padding:0 20px;-webkit-overflow-scrolling:touch">';
            keywords.forEach(function (k, i) {
                var c = colors[i % colors.length];
                html += '<div class="quick-search touch-active" data-kw="' + k + '" style="min-width:140px;height:100px;border-radius:12px;background:linear-gradient(135deg,' + c + ');padding:12px;display:flex;align-items:flex-end;color:#fff;font-weight:700;font-size:16px;box-shadow:0 4px 12px rgba(0,0,0,0.15);cursor:pointer;flex-shrink:0">' + k + '</div>';
            });
            html += '</div>';

            // Section 2: Recently Played
            if (state.history.length > 0) {
                html += '<div style="display:flex;justify-content:space-between;align-items:end;margin-bottom:16px">';
                html += '<h3 style="font-size:22px;font-weight:700;margin:0;color:' + T.text + '">最近播放</h3>';
                html += '<span style="font-size:15px;color:' + T.primary + ';font-weight:500">查看全部</span>';
                html += '</div>';

                html += '<div style="display:flex;flex-direction:column">';
                state.history.slice(0, 5).forEach(function (s, i) {
                    html += '<div class="history-item touch-active" data-idx="' + i + '" style="display:flex;align-items:center;gap:16px;padding:10px 0;border-bottom:0.5px solid rgba(0,0,0,0.05);cursor:pointer">';
                    html += '<img src="' + s.cover + '" style="width:56px;height:56px;border-radius:6px;object-fit:cover;background:#eee">';
                    html += '<div style="flex:1;min-width:0">';
                    html += '<div style="font-weight:500;font-size:16px;color:' + T.text + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px">' + s.name + '</div>';
                    html += '<div style="font-size:14px;color:' + T.textLight + '">' + s.singer + '</div>';
                    html += '</div>';
                    html += '</div>';
                });
                html += '</div>';
            } else {
                html += '<div style="background:' + T.card + ';border-radius:16px;padding:30px;text-align:center;margin-top:20px">';
                html += '<div style="font-size:48px;color:' + T.textLight + ';opacity:0.3;margin-bottom:10px">' + I.music + '</div>';
                html += '<div style="color:' + T.textLight + ';font-size:15px">快去听听歌吧</div>';
                html += '</div>';
            }

            html += '</div>';
            content.innerHTML = html;

            // Bind events
            var quickBtns = doc.querySelectorAll('.quick-search');
            quickBtns.forEach(function (el) {
                el.onclick = function () {
                    var kw = el.dataset.kw;
                    var input = doc.getElementById('search-input');
                    if (input) input.value = kw;
                    search(kw);
                };
            });

            var historyItems = doc.querySelectorAll('.history-item');
            historyItems.forEach(function (el) {
                el.onclick = function () {
                    var idx = parseInt(el.dataset.idx);
                    playSong(state.history[idx], state.history.slice(0, 20), 'Recently Played', idx);
                };
            });
        }

        function renderFavorites() {
            renderSongList(state.favorites, '我的收藏', 'fav');
        }

        function renderQueue() {
            if (!doc) return;
            var content = doc.getElementById('content');
            if (!content) return;

            var html = '<div style="padding:20px 20px 120px">';
            html += '<h2 style="font-size:32px;font-weight:800;color:' + T.text + ';margin:0 0 24px;letter-spacing:-1px">播放队列</h2>';

            if (state.queue.length === 0) {
                html += '<div style="text-align:center;padding:40px 0;color:' + T.textLight + '">队列为空</div>';
                content.innerHTML = html;
                return;
            }

            html += '<div style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">';
            html += '<span style="font-size:15px;color:' + T.textLight + ';font-weight:500">待播放</span>';
            html += '<div id="clear-queue" style="background:rgba(0,0,0,0.05);color:' + T.primary + ';padding:6px 14px;border-radius:20px;font-size:14px;font-weight:600;cursor:pointer">清空</div>';
            html += '</div>';

            html += '<div>';
            state.queue.forEach(function (s, i) {
                var isActive = i === state.queueIndex;
                html += '<div class="queue-item touch-active" data-idx="' + i + '" style="display:flex;align-items:center;gap:16px;padding:12px 16px;background:' + (isActive ? T.card : 'transparent') + ';border-radius:12px;margin-bottom:2px;cursor:pointer">';
                if (isActive) {
                    html += '<div style="width:20px;display:flex;justify-content:center"><div style="width:4px;height:4px;background:' + T.primary + ';border-radius:50%"></div></div>';
                } else {
                    html += '<div style="width:20px;text-align:center;color:' + T.textLight + ';font-size:14px;font-weight:500">' + (i + 1) + '</div>';
                }
                html += '<img src="' + s.cover + '" style="width:40px;height:40px;border-radius:4px;object-fit:cover;background:#eee">';
                html += '<div style="flex:1;min-width:0">';
                html += '<div style="font-weight:500;font-size:16px;color:' + (isActive ? T.primary : T.text) + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + s.name + '</div>';
                html += '<div style="font-size:14px;color:' + T.textLight + '">' + s.singer + '</div>';
                html += '</div>';
                html += '</div>';
            });
            html += '</div>';

            html += '</div>';
            content.innerHTML = html;

            var clearBtn = doc.getElementById('clear-queue');
            if (clearBtn) {
                clearBtn.addEventListener('click', function () {
                    stopMusic();
                    switchTab('queue');
                });
            }

            var queueItems = doc.querySelectorAll('.queue-item');
            queueItems.forEach(function (el) {
                el.onclick = function () {
                    playFromQueue(parseInt(el.dataset.idx));
                };
            });
        }

        // ============ 标签切换 ============
        function switchTab(tab) {
            if (!doc) return;
            currentTab = tab;

            var tabs = doc.querySelectorAll('.tab');
            tabs.forEach(function (t) {
                var active = t.dataset.tab === tab;
                t.style.color = active ? T.primary : T.textLight;
                // t.style.borderBottomColor = active ? T.primary : 'transparent'; // No border in iOS tab bar
            });

            if (tab === 'home') renderHome();
            else if (tab === 'fav') renderFavorites();
            else if (tab === 'queue') renderQueue();
        }

        function bindFavBtns(songs) {
            if (!doc) return;
            var btns = doc.querySelectorAll('[data-fav]');
            btns.forEach(function (btn) {
                btn.onclick = function (e) {
                    e.stopPropagation();
                    var id = parseInt(btn.dataset.fav);
                    var song = songs.find(function (s) { return s.id === id; }) || state.currentSong;
                    if (song) toggleFav(song);
                };
            });
        }

        // ============ 全屏队列面板 (Slide Over) ============
        function showFullQueue() {
            if (!doc) return;
            var panel = doc.getElementById('queue-panel');
            if (panel) {
                updateQueuePanel();
                panel.style.transform = 'translateY(0)';
            }
        }

        function hideFullQueue() {
            if (!doc) return;
            var panel = doc.getElementById('queue-panel');
            if (panel) panel.style.transform = 'translateY(100%)';
        }

        function updateQueuePanel() {
            if (!doc) return;
            var list = doc.getElementById('queue-list');
            if (!list) return;

            var html = '';
            state.queue.forEach(function (s, i) {
                var isActive = i === state.queueIndex;
                html += '<div class="queue-panel-item" data-idx="' + i + '" style="display:flex;align-items:center;gap:12px;padding:12px 0;cursor:pointer;border-bottom:1px solid rgba(0,0,0,0.05)">';
                html += '<div style="width:24px;text-align:center;color:' + (isActive ? T.primary : '#999') + ';font-size:14px">' + (isActive ? '●' : (i + 1)) + '</div>';
                html += '<img src="' + s.cover + '" style="width:40px;height:40px;border-radius:6px;background:#eee">';
                html += '<div style="flex:1;overflow:hidden">';
                html += '<div style="font-size:16px;color:' + (isActive ? T.primary : '#000') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500">' + s.name + '</div>';
                html += '<div style="font-size:14px;color:#888">' + s.singer + '</div>';
                html += '</div>';
                html += '</div>';
            });

            list.innerHTML = html;

            var items = list.querySelectorAll('.queue-panel-item');
            items.forEach(function (el) {
                el.onclick = function () {
                    playFromQueue(parseInt(el.dataset.idx));
                    hideFullQueue();
                };
            });
        }

        // ============ 生成HTML (RemixIcon + Chinese) ============
        function genHTML() {
            var hasSong = !!state.currentSong;
            var songName = state.currentSong ? state.currentSong.name : '未播放';
            var songSinger = state.currentSong ? state.currentSong.singer : '---';
            var songCover = state.currentSong ? state.currentSong.cover : '';
            var playIcon = state.isPlaying ? I.pause : I.play;
            var favIcon = (state.currentSong && isFav(state.currentSong.id)) ? I.heartFill : I.heart;
            var songId = state.currentSong ? state.currentSong.id : 0;

            var html = '';
            html += '<div id="music-app" style="position:absolute;inset:0;background:' + T.bg + ';display:flex;flex-direction:column;overflow:hidden;z-index:400;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif">';
            // CDN Link
            html += '<link href="https://cdn.jsdelivr.net/npm/remixicon@3.5.0/fonts/remixicon.css" rel="stylesheet">';
            html += '<style>' +
                '::-webkit-scrollbar{width:0px}' +
                '.touch-active:active{opacity:0.6;transform:scale(0.98)}' +
                '@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}' +
                '</style>';

            // 头部 (中文 + 返回桌面)
            html += '<div style="background:' + T.bg + ';padding:40px 20px 10px;flex-shrink:0;display:flex;flex-direction:column;z-index:100">';
            html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">';
            // 返回桌面按钮
            html += '<div id="go-desktop" style="width:32px;height:32px;border-radius:50%;background:' + T.card + ';color:' + T.textLight + ';display:flex;align-items:center;justify-content:center;cursor:pointer">' + I.backToDesk + '</div>';

            html += '<h1 style="font-size:28px;font-weight:700;letter-spacing:-0.5px;color:' + T.text + ';margin:0">音乐</h1>';

            html += '<div id="stop-btn" style="width:32px;height:32px;border-radius:50%;background:' + T.card + ';color:' + T.heart + ';display:flex;align-items:center;justify-content:center;cursor:pointer" title="停止播放">' + I.stop + '</div>';
            html += '</div>';

            // 搜索栏
            html += '<div style="background:' + T.card + ';height:36px;border-radius:10px;padding:0 12px;display:flex;align-items:center;margin-bottom:6px;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.05)">';
            html += '<span style="color:' + T.textLight + ';margin-right:8px;display:flex;transform:scale(0.9)">' + I.search + '</span>';
            html += '<input type="text" id="search-input" style="background:transparent;flex:1;outline:none;border:none;font-size:15px;color:' + T.text + ';font-weight:400" placeholder="搜索歌曲、歌手、专辑...">';
            html += '</div>';
            html += '</div>';

            // 内容区域
            html += '<div id="content" style="flex:1;overflow-y:auto;padding-bottom:' + (hasSong ? '114px' : '64px') + ';background:' + T.bg + '"></div>';

            // Mini播放器 (透明模糊悬浮)
            html += '<div id="mini" style="position:absolute;bottom:64px;left:10px;right:10px;height:60px;background:rgba(255,255,255,0.85);backdrop-filter:blur(20px);border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.08);display:' + (hasSong ? 'flex' : 'none') + ';align-items:center;padding:0 12px;z-index:500;cursor:pointer;border:1px solid rgba(255,255,255,0.5)">';
            html += '<div id="mini-prog" style="position:absolute;bottom:0;left:12px;right:12px;height:2px;background:rgba(0,0,0,0.05);border-radius:1px;overflow:hidden">';
            html += '<div id="prog-fill" style="height:100%;background:' + T.primary + ';width:0"></div>';
            html += '</div>';
            html += '<img id="mini-cover" src="' + songCover + '" style="width:40px;height:40px;border-radius:8px;object-fit:cover;margin-right:12px;background:#eee;">';
            html += '<div style="flex:1;overflow:hidden;margin-right:10px">';
            html += '<div id="mini-title" style="font-size:15px;font-weight:600;color:' + T.text + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px">' + songName + '</div>';
            html += '</div>';
            html += '<div style="display:flex;gap:12px;align-items:center">';
            html += '<div id="mini-play" style="color:' + T.text + ';cursor:pointer;display:flex">' + playIcon + '</div>';
            html += '<div id="mini-next" style="color:' + T.text + ';cursor:pointer;display:flex">' + I.next + '</div>';
            html += '</div>';
            html += '</div>';

            // 底部标签栏
            html += '<div style="height:60px;background:' + T.tabBg + ';backdrop-filter:blur(20px);display:flex;align-items:center;position:absolute;bottom:0;left:0;right:0;z-index:500;padding-bottom:10px;box-shadow:0 -1px 0 rgba(0,0,0,0.05)">';
            html += '<div class="tab touch-active" data-tab="home" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;height:100%;cursor:pointer;color:' + T.primary + '">';
            html += '<div style="transform:scale(0.9)">' + I.discover + '</div>';
            html += '<div style="font-size:10px;font-weight:500">发现</div>';
            html += '</div>';
            html += '<div class="tab touch-active" data-tab="fav" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;height:100%;cursor:pointer;color:' + T.textLight + '">';
            html += '<div style="transform:scale(0.9)">' + I.heart + '</div>';
            html += '<div style="font-size:10px;font-weight:500">我的</div>';
            html += '</div>';
            html += '<div class="tab touch-active" data-tab="queue" style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;height:100%;cursor:pointer;color:' + T.textLight + '">';
            html += '<div style="transform:scale(0.9)">' + I.list + '</div>';
            html += '<div style="font-size:10px;font-weight:500">队列</div>';
            html += '</div>';
            html += '</div>';

            // 全屏播放器
            html += '<div id="full" style="position:absolute;inset:0;background:' + T.bg + ';transform:translateY(100%);transition:transform 0.4s cubic-bezier(0.32,0.72,0,1);z-index:600;display:flex;flex-direction:column;overflow:hidden">';
            // 背景虚化
            html += '<div id="full-bg" style="position:absolute;inset:0;background-size:cover;background-position:center;opacity:0.6;filter:blur(80px);transform:scale(1.2);background-image:url(\'' + songCover + '\')"></div>';
            html += '<div style="position:absolute;inset:0;background:rgba(255,255,255,0.7);backdrop-filter:blur(60px)"></div>';

            // 全屏顶部
            html += '<div style="position:relative;z-index:10;height:44px;margin-top:44px;display:flex;align-items:center;justify-content:center;padding:0 20px">';
            html += '<div id="full-close" style="position:absolute;left:50%;top:0;transform:translateX(-50%);width:40px;height:5px;background:rgba(0,0,0,0.1);border-radius:3px;cursor:pointer"></div>';
            html += '</div>';

            // 封面区
            html += '<div style="position:relative;z-index:10;flex:1;display:flex;align-items:center;justify-content:center;padding:20px 40px">';
            html += '<div style="width:100%;aspect-ratio:1/1;border-radius:24px;box-shadow:0 20px 50px -10px rgba(0,0,0,0.2);overflow:hidden;background:#333">';
            html += '<img id="full-cover" src="' + songCover + '" style="width:100%;height:100%;object-fit:cover">';
            html += '</div>';
            html += '</div>';

            // 信息区
            html += '<div style="position:relative;z-index:10;padding:20px 32px 60px">';
            html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:30px">';
            html += '<div style="flex:1;overflow:hidden;margin-right:20px">';
            html += '<div id="full-title" style="font-weight:700;font-size:24px;color:#000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px">' + songName + '</div>';
            html += '<div id="full-artist" style="font-size:18px;color:' + T.textLight + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + songSinger + '</div>';
            html += '</div>';
            html += '<div id="full-fav" data-fav="' + songId + '" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:' + T.primary + '">' + favIcon + '</div>';
            html += '</div>';

            // 进度条
            html += '<div style="margin-bottom:30px">';
            html += '<div id="prog-bar" style="height:4px;background:rgba(0,0,0,0.06);border-radius:2px;cursor:pointer;position:relative;margin-bottom:8px">';
            html += '<div id="prog-fill" style="height:100%;background:' + T.textLight + ';border-radius:2px;width:0"></div>';
            html += '<div id="prog-thumb" style="position:absolute;top:50%;transform:translate(-50%,-50%);width:16px;height:16px;background:#fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.2);left:0;opacity:1"></div>';
            html += '</div>';
            html += '<div style="display:flex;justify-content:space-between;font-size:12px;color:' + T.textLight + ';font-weight:600;font-variant-numeric:tabular-nums">';
            html += '<span id="time-cur">0:00</span>';
            html += '<span id="time-total">0:00</span>';
            html += '</div>';
            html += '</div>';

            // 控制按钮 (统一栏: 模式 - 上一首 - 播放 - 下一首 - 列表)
            html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:0 20px;margin-top:20px">';

            // 模式
            html += '<div id="mode-btn" style="cursor:pointer;padding:10px;color:' + T.textLight + ';display:flex;align-items:center;justify-content:center">' + I.modeLoop + '</div>';

            // 上一首
            html += '<div id="prev-btn" style="cursor:pointer;color:#333;opacity:0.9;display:flex;align-items:center;justify-content:center">' + I.prev + '</div>';

            // 播放
            html += '<div id="full-play" style="width:72px;height:72px;border-radius:50%;background:' + T.gradient + ';box-shadow:0 10px 30px rgba(255,100,100,0.3);cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center;transform:scale(1.1)">' + playIcon + '</div>';

            // 下一首
            html += '<div id="next-btn" style="cursor:pointer;color:#333;opacity:0.9;display:flex;align-items:center;justify-content:center">' + I.next + '</div>';

            // 列表
            html += '<div id="show-queue" style="cursor:pointer;padding:10px;color:' + T.textLight + ';display:flex;align-items:center;justify-content:center">' + I.list + '</div>';

            html += '</div>';

            // 歌词提示 (放在按钮下方，更小一点)
            html += '<div id="lyric" style="text-align:center;margin-top:24px;font-size:13px;color:' + T.textLight + ';opacity:0.6;height:20px;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 30px">♪ 歌词加载中...</div>';

            html += '</div>'; // end info area

            // 队列面板
            html += '<div id="queue-panel" style="position:absolute;bottom:0;left:0;right:0;height:70%;background:rgba(255,255,255,0.95);backdrop-filter:blur(30px);border-radius:24px 24px 0 0;transform:translateY(100%);transition:transform 0.4s cubic-bezier(0.3,0,0,1);z-index:700;display:flex;flex-direction:column;box-shadow:0 -10px 40px rgba(0,0,0,0.1)">';
            html += '<div style="padding:20px;display:flex;justify-content:space-between;align-items:center">';
            html += '<div style="font-weight:700;font-size:18px;color:#000">待播放清单</div>';
            html += '<div id="close-queue-panel" style="width:30px;height:30px;background:rgba(0,0,0,0.05);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#000">' + I.down + '</div>';
            html += '</div>';
            html += '<div id="queue-list" style="flex:1;overflow-y:auto;padding:0 20px 40px"></div>';
            html += '</div>';

            html += '</div>'; // 全屏播放器结束
            html += '</div>'; // app结束

            return html;
        }

        // ============ 绑定事件 ============
        function bindEvents() {
            if (!doc) return;

            // 返回
            var backBtn = doc.getElementById('back-btn');
            if (backBtn) {
                backBtn.addEventListener('click', function () {
                    closeApp();
                    if (window.parent && window.parent.PhoneSystem) {
                        window.parent.PhoneSystem.goHome();
                    }
                });
            }

            // 停止
            var stopBtn = doc.getElementById('stop-btn');
            if (stopBtn) {
                stopBtn.addEventListener('click', stopMusic);
            }

            // 搜索
            var searchInput = doc.getElementById('search-input');
            if (searchInput) {
                searchInput.onkeydown = function (e) {
                    if (e.key === 'Enter') {
                        search(searchInput.value.trim());
                    }
                };
            }

            // 标签
            var tabs = doc.querySelectorAll('.tab');
            tabs.forEach(function (t) {
                t.onclick = function () {
                    switchTab(t.dataset.tab);
                };
            });

            // Mini播放器
            var mini = doc.getElementById('mini');
            if (mini) {
                mini.onclick = function (e) {
                    var target = e.target;
                    var id = target.id;
                    if (!id && target.parentElement) id = target.parentElement.id;

                    if (id === 'mini-play') {
                        e.stopPropagation();
                        togglePlay();
                    } else if (id === 'mini-next') {
                        e.stopPropagation();
                        playNext();
                    } else {
                        var full = doc.getElementById('full');
                        if (full) full.style.transform = 'translateY(0)';
                    }
                };
            }

            // 全屏播放器
            var fullClose = doc.getElementById('full-close');
            if (fullClose) {
                fullClose.addEventListener('click', function () {
                    var full = doc.getElementById('full');
                    if (full) full.style.transform = 'translateY(100%)';
                });
            }

            var fullPlay = doc.getElementById('full-play');
            if (fullPlay) {
                fullPlay.addEventListener('click', togglePlay);
            }

            var prevBtn = doc.getElementById('prev-btn');
            if (prevBtn) {
                prevBtn.addEventListener('click', playPrev);
            }

            var nextBtn = doc.getElementById('next-btn');
            if (nextBtn) {
                nextBtn.addEventListener('click', playNext);
            }

            var fullFav = doc.getElementById('full-fav');
            if (fullFav) {
                fullFav.addEventListener('click', function () {
                    if (state.currentSong) {
                        toggleFav(state.currentSong);
                        updateUI();
                    }
                });
            }

            // 进度条
            var progBar = doc.getElementById('prog-bar');
            if (progBar) {
                progBar.addEventListener('click', function (e) {
                    var rect = progBar.getBoundingClientRect();
                    var pct = ((e.clientX - rect.left) / rect.width) * 100;
                    seekTo(pct);
                });
            }

            // 队列面板
            var showQueue = doc.getElementById('show-queue');
            if (showQueue) {
                showQueue.addEventListener('click', showFullQueue);
            }

            var showQueue2 = doc.getElementById('show-queue2');
            if (showQueue2) {
                showQueue2.addEventListener('click', showFullQueue);
            }

            var closeQueuePanel = doc.getElementById('close-queue-panel');
            if (closeQueuePanel) {
                closeQueuePanel.addEventListener('click', hideFullQueue);
            }

            // Mode Toggle
            var modeBtn = doc.getElementById('mode-btn');
            if (modeBtn) {
                modeBtn.addEventListener('click', toggleMode);
            }

            // Go Desktop
            var goDesktop = doc.getElementById('go-desktop');
            if (goDesktop) {
                goDesktop.addEventListener('click', closeApp);
            }

            // 音频事件
            audio.ontimeupdate = updateProgress;
            audio.onended = function () {
                state.isPlaying = false;
                updateUI();
                playNext(true); // auto play next
            };
            audio.onplay = function () {
                state.isPlaying = true;
                updateUI();
            };
            audio.onpause = function () {
                state.isPlaying = false;
                updateUI();
            };
        }

        // ============ 打开/关闭 ============
        function openApp() {
            var ps = window.parent ? window.parent.PhoneSystem : null;
            if (!ps || !ps.iframeWindow) {
                setTimeout(openApp, 200);
                return;
            }

            try {
                doc = ps.iframeWindow.document;
            } catch (e) {
                console.error('[音乐APP] 无法访问iframe');
                return;
            }

            var home = doc.getElementById('home-screen');
            if (home) home.style.display = 'none';

            var container = doc.getElementById('app-container');
            if (!container) {
                var screen = doc.querySelector('.screen');
                if (screen) {
                    container = doc.createElement('div');
                    container.id = 'app-container';
                    container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:300;pointer-events:none';
                    screen.appendChild(container);
                }
            }

            if (container) {
                container.innerHTML = genHTML();
                container.style.pointerEvents = 'auto';

                setTimeout(function () {
                    bindEvents();
                    renderHome();

                    if (audio.src && !audio.paused) {
                        state.isPlaying = true;
                    }
                    updateUI();
                }, 50);
            }

            var statusBar = doc.getElementById('status-bar');
            if (statusBar) {
                statusBar.classList.remove('light');
                statusBar.classList.add('dark');
            }
        }

        function closeApp() {
            console.log('[音乐APP] closeApp');
            var ps = window.parent ? window.parent.PhoneSystem : null;
            var iframeWindow = ps ? ps.iframeWindow : null;

            if (!iframeWindow) {
                doc = null;
                return;
            }

            try {
                var d = iframeWindow.document;
                var container = d.getElementById('app-container');
                if (container) {
                    container.innerHTML = '';
                    container.style.pointerEvents = 'none';
                }

                var home = d.getElementById('home-screen');
                if (home) home.style.display = 'block';

                var statusBar = d.getElementById('status-bar');
                if (statusBar) {
                    statusBar.classList.remove('dark');
                    statusBar.classList.add('light');
                }
            } catch (e) {
                console.error('[音乐APP] closeApp错误', e);
            }

            doc = null;
        }

        // ============ 注册 ============
        // ============ 注册 ============
        window.parent.PhoneSystem.registerApp({
            id: APP_ID,
            name: 'Music',
            icon: I.music,
            color: T.primary, // Red background
            order: 20
        });

        window.parent.PhoneSystem.on('app-opened', function (data) {
            if (data.id === APP_ID) openApp();
        });

        window.parent.PhoneSystem.on('go-home', closeApp);

        // ============ 停止播放并清理 ============
        function stopAndCleanup() {
            console.log('[音乐APP] 停止播放并清理');
            audio.pause();
            audio.src = '';
            state.currentSong = null;
            state.isPlaying = false;
            state.queue = [];
            state.queueIndex = -1;
            save();
        }

        // ============ 监听脚本卸载事件（切换聊天时停止播放） ============
        $(window).on('pagehide', function () {
            console.log('[音乐APP] 脚本正在卸载，停止播放');
            stopAndCleanup();
        });

        // ============ 监听聊天切换（回到酒馆主界面时停止播放） ============
        if (typeof eventOn === 'function') {
            eventOn('chat_id_changed', function (chatFileName) {
                if (!chatFileName) {
                    // 回到主界面，停止播放
                    console.log('[音乐APP] 检测到回到主界面，停止播放');
                    stopAndCleanup();
                }
            });
        }

        console.log('[音乐APP] v3.1 已加载');
    });
})();
