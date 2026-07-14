(function() {
    'use strict';
    const supabase = window.supabase.createClient(
        'https://iljsednetiogjtowlexo.supabase.co',
        'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O'
    );

    // ========== DOM ==========
    const $ = id => document.getElementById(id);
    const DOM = {
        authOverlay: $('authOverlay'), appContainer: $('appContainer'),
        loginForm: $('loginForm'), registerForm: $('registerForm'),
        loginEmail: $('loginEmail'), loginPassword: $('loginPassword'), loginError: $('loginError'),
        regNickname: $('regNickname'), regEmail: $('regEmail'), regPassword: $('regPassword'), regError: $('regError'),
        userEmoji: $('userEmoji'), userName: $('userName'),
        composerEmoji: $('composerEmoji'),
        postTextarea: $('postTextarea'), charCounter: $('charCounter'), publishBtn: $('publishBtn'),
        composerError: $('composerError'), composerErrorText: $('composerErrorText'),
        postsFeed: $('postsFeed'), feedLoading: $('feedLoading'), feedEmpty: $('feedEmpty'), feedError: $('feedError'),
        retryBtn: $('retryBtn'), profileModal: $('profileModal'),
        modalEmojiDisplay: $('modalEmojiDisplay'), modalNickname: $('modalNickname'), modalBio: $('modalBio'),
        emojiPicker: $('emojiPicker'),
        imagePreview: $('imagePreview'), previewImg: $('previewImg'),
        videoPreview: $('videoPreview'), previewVideo: $('previewVideo'),
        screenHome: $('screenHome'), screenProfile: $('screenProfile'), screenMyPosts: $('screenMyPosts'),
        screenFollowing: $('screenFollowing'), screenVideo: $('screenVideo'),
        profileContainer: $('profileContainer'),
        myPostsFeed: $('myPostsFeed'), myPostsLoading: $('myPostsLoading'), myPostsEmpty: $('myPostsEmpty'),
        followingFeed: $('followingFeed'), followingLoading: $('followingLoading'), followingEmpty: $('followingEmpty'),
        videoFeed: $('videoFeed'), videoLoading: $('videoLoading'), videoEmpty: $('videoEmpty'),
        listModal: $('listModal'), listModalTitle: $('listModalTitle'), listModalContent: $('listModalContent'),
        navItems: document.querySelectorAll('.nav-item')
    };

    // ========== STATE ==========
    let currentUser = null, profile = null, isPublishing = false, isAdmin = false;
    let likedPostIds = new Set(), bannedUserIds = new Set();
    let selectedImage = null, selectedVideo = null;
    let currentScreen = 'home', viewingUserId = null;

    // ========== HELPERS ==========
    const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]);
    const fmtDate = d => {
        if (!d) return '';
        const diff = Math.floor((Date.now() - new Date(d)) / 1000);
        if (diff < 60) return 'сейчас';
        if (diff < 3600) return Math.floor(diff/60) + 'м';
        if (diff < 86400) return Math.floor(diff/3600) + 'ч';
        return new Date(d).toLocaleDateString('ru-RU', {day:'numeric',month:'short'});
    };
    const EMOJI_LIST = ['😀','😂','😍','😎','🤩','😇','🤠','💀','👽','🤖','🎃','😺','🦊','🐼','🐨','🐸','🦄','🐙','🍕','🍔','🎉','❤️','🔥','⭐','🌈','⚡','💎','🎵','📸','🎮'];

    // ========== AUTH ==========
    async function checkSession() {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) { currentUser = user; await loadProfile(); showApp(); }
        else showAuth();
    }
    async function loadProfile(userId = null) {
        const id = userId || currentUser.id;
        const { data } = await supabase.from('profiles').select('*').eq('id', id).single();
        const loaded = data || { nickname: 'Гость', bio: '', role: 'user', emoji: '👤' };
        if (!userId) profile = loaded;
        return loaded;
    }
    function updateAllUI() {
        if (!profile) return;
        DOM.userName.textContent = profile.nickname || 'Гость';
        DOM.userEmoji.textContent = profile.emoji || '👤';
        DOM.composerEmoji.textContent = profile.emoji || '👤';
        DOM.modalEmojiDisplay.textContent = profile.emoji || '👤';
        updatePublishBtn();
    }
    function showApp() { DOM.authOverlay.classList.add('hidden'); DOM.appContainer.classList.remove('hidden'); initApp(); }
    function showAuth() { DOM.authOverlay.classList.remove('hidden'); DOM.appContainer.classList.add('hidden'); }

    // ========== AUTH HANDLERS ==========
    DOM.registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { data, error } = await supabase.auth.signUp({ email: DOM.regEmail.value, password: DOM.regPassword.value });
        if (error) { DOM.regError.textContent = error.message; return; }
        if (data.user) {
            await supabase.from('profiles').insert({ id: data.user.id, nickname: DOM.regNickname.value || DOM.regEmail.value.split('@')[0], emoji: '👤' });
            DOM.regError.style.color = '#0c0';
            DOM.regError.innerHTML = '✅ Аккаунт создан!<br><small>Перейдите на вкладку <b>Вход</b> и войдите.</small>';
            DOM.registerForm.reset();
            setTimeout(() => {
                document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                document.querySelector('[data-tab="login"]').classList.add('active');
                DOM.loginForm.classList.remove('hidden');
                DOM.registerForm.classList.add('hidden');
                DOM.regError.innerHTML = '';
            }, 2000);
        }
    });
    DOM.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const { error } = await supabase.auth.signInWithPassword({ email: DOM.loginEmail.value, password: DOM.loginPassword.value });
        if (error) DOM.loginError.textContent = error.message === 'Email not confirmed' ? 'Подтвердите почту.' : error.message;
        else checkSession();
    });
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            DOM.loginForm.classList.toggle('hidden', tab.dataset.tab !== 'login');
            DOM.registerForm.classList.toggle('hidden', tab.dataset.tab !== 'register');
        });
    });
    $('logoutBtn').addEventListener('click', async () => { await supabase.auth.signOut(); currentUser = null; profile = null; showAuth(); });

    // ========== PROFILE EDITOR ==========
    $('userSettingsBtn').addEventListener('click', () => {
        DOM.profileModal.classList.remove('hidden');
        DOM.modalNickname.value = profile?.nickname || '';
        DOM.modalBio.value = profile?.bio || '';
        DOM.modalEmojiDisplay.textContent = profile?.emoji || '👤';
        DOM.emojiPicker.classList.add('hidden');
        DOM.emojiPicker.innerHTML = EMOJI_LIST.map(e => `<span class="emoji-option" data-emoji="${e}">${e}</span>`).join('');
        DOM.emojiPicker.querySelectorAll('.emoji-option').forEach(opt => {
            opt.addEventListener('click', () => {
                DOM.modalEmojiDisplay.textContent = opt.dataset.emoji;
                DOM.emojiPicker.classList.add('hidden');
            });
        });
    });
    $('modalCancel').addEventListener('click', () => DOM.profileModal.classList.add('hidden'));
    $('modalEmojiBtn').addEventListener('click', () => DOM.emojiPicker.classList.toggle('hidden'));
    $('modalSave').addEventListener('click', async () => {
        const nick = DOM.modalNickname.value.trim();
        const bio = DOM.modalBio.value.trim();
        const emoji = DOM.modalEmojiDisplay.textContent || '👤';
        if (!nick) return;
        profile.nickname = nick; profile.bio = bio; profile.emoji = emoji;
        await supabase.from('profiles').upsert({ id: currentUser.id, nickname: nick, bio: bio, emoji: emoji });
        updateAllUI();
        DOM.profileModal.classList.add('hidden');
        if (viewingUserId === currentUser.id) openProfile(currentUser.id);
    });

    // ========== NAVIGATION ==========
    function switchScreen(screen) {
        [DOM.screenHome, DOM.screenProfile, DOM.screenMyPosts, DOM.screenFollowing, DOM.screenVideo].forEach(s => s.classList.remove('active'));
        const map = { home: DOM.screenHome, profile: DOM.screenProfile, myPosts: DOM.screenMyPosts, following: DOM.screenFollowing, video: DOM.screenVideo };
        if (map[screen]) map[screen].classList.add('active');
        currentScreen = screen;
        DOM.navItems.forEach(item => item.classList.toggle('active', item.dataset.screen === screen));
        if (screen === 'home') loadPosts();
        else if (screen === 'myPosts') loadMyPosts();
        else if (screen === 'following') loadFollowingPosts();
        else if (screen === 'video') loadVideoPosts();
    }
    DOM.navItems.forEach(item => item.addEventListener('click', () => switchScreen(item.dataset.screen)));

    // ========== FOLLOW SYSTEM ==========
    async function isFollowing(userId) {
        if (!currentUser || userId === currentUser.id) return false;
        const { data } = await supabase.from('followers').select('*').eq('follower_id', currentUser.id).eq('following_id', userId).maybeSingle();
        return !!data;
    }
    async function toggleFollow(userId, btn) {
        if (!currentUser) return;
        const following = await isFollowing(userId);
        if (following) await supabase.from('followers').delete().match({ follower_id: currentUser.id, following_id: userId });
        else await supabase.from('followers').insert({ follower_id: currentUser.id, following_id: userId });
        const newState = !following;
        if (btn) { btn.textContent = newState ? 'Отписаться' : 'Подписаться'; btn.classList.toggle('is-following', newState); }
        if (viewingUserId === userId) {
            const [f, fg] = await Promise.all([getFollowersCount(userId), getFollowingCount(userId)]);
            const elF = document.getElementById('statFollowers'), elG = document.getElementById('statFollowing');
            if (elF) elF.innerHTML = `<span class="profile-stat-value">${f}</span> подписчиков`;
            if (elG) elG.innerHTML = `<span class="profile-stat-value">${fg}</span> подписок`;
        }
    }
    async function getFollowersCount(userId) {
        const { count } = await supabase.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', userId);
        return count || 0;
    }
    async function getFollowingCount(userId) {
        const { count } = await supabase.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', userId);
        return count || 0;
    }
    async function showList(title, field, value) {
        DOM.listModalTitle.textContent = title; DOM.listModalContent.innerHTML = ''; DOM.listModal.classList.remove('hidden');
        const { data } = await supabase.from('followers').select(field).eq(field, value);
        const ids = data ? data.map(r => field === 'following_id' ? r.follower_id : r.following_id) : [];
        if (!ids.length) { DOM.listModalContent.innerHTML = '<p style="color:#555;">Пусто</p>'; return; }
        const { data: profs } = await supabase.from('profiles').select('*').in('id', ids);
        profs?.forEach(p => {
            const d = document.createElement('div'); d.className = 'modal-list-item';
            d.innerHTML = `<div class="modal-list-avatar">${p.emoji||'👤'}</div><span class="modal-list-name">${esc(p.nickname||'Без ника')}</span>`;
            d.addEventListener('click', () => { DOM.listModal.classList.add('hidden'); openProfile(p.id); });
            DOM.listModalContent.appendChild(d);
        });
    }
    $('listModalClose').addEventListener('click', () => DOM.listModal.classList.add('hidden'));

    // ========== OPEN PROFILE ==========
    async function openProfile(userId) {
        viewingUserId = userId;
        switchScreen('profile');
        DOM.profileContainer.innerHTML = '<div class="feed-state"><i class="fa-solid fa-spinner fa-spin-pulse"></i> Загрузка...</div>';
        const prof = await loadProfile(userId);
        if (!prof) return;
        const [followers, followingCount] = await Promise.all([getFollowersCount(userId), getFollowingCount(userId)]);
        const { count: postsCount } = await supabase.from('posts').select('*', { count: 'exact', head: true }).eq('user_id', userId);
        const { data: likesData } = await supabase.from('posts').select('likes').eq('user_id', userId);
        const totalLikes = likesData ? likesData.reduce((s, p) => s + (p.likes || 0), 0) : 0;
        const isOwn = currentUser && userId === currentUser.id;
        const followingStatus = await isFollowing(userId);
        const roleText = prof.role === 'admin' ? 'Администратор' : (prof.role === 'moderator' ? 'Модератор' : 'Пользователь');
        const joinDate = prof.created_at ? new Date(prof.created_at).toLocaleDateString('ru-RU') : '—';

        DOM.profileContainer.innerHTML = `
            <div class="profile-header-card" data-user-id="${userId}">
                <div class="profile-avatar-large">${prof.emoji || '👤'}</div>
                <div class="profile-nickname-large">${esc(prof.nickname)}</div>
                <div class="profile-bio">${esc(prof.bio || '')}</div>
                <div class="profile-stats">
                    <div class="profile-stat"><span class="profile-stat-value">${postsCount||0}</span> постов</div>
                    <div class="profile-stat" id="statFollowers"><span class="profile-stat-value">${followers}</span> подписчиков</div>
                    <div class="profile-stat" id="statFollowing"><span class="profile-stat-value">${followingCount}</span> подписок</div>
                    <div class="profile-stat"><span class="profile-stat-value">${totalLikes}</span> лайков</div>
                </div>
                <div class="profile-role">${roleText} · ${joinDate}</div>
                <div class="profile-actions">
                    ${isOwn ? '<button class="profile-btn primary" id="openProfileEditor">Редактировать</button>' : `<button class="follow-btn ${followingStatus ? 'is-following' : ''}" id="followBtn">${followingStatus ? 'Отписаться' : 'Подписаться'}</button>`}
                </div>
            </div>
            <div class="profile-posts"><h3 class="profile-section-title">Посты</h3><div class="feed-list" id="profilePostsFeed"></div></div>`;

        document.getElementById('statFollowers')?.addEventListener('click', () => showList('Подписчики', 'following_id', userId));
        document.getElementById('statFollowing')?.addEventListener('click', () => showList('Подписки', 'follower_id', userId));
        if (isOwn) document.getElementById('openProfileEditor')?.addEventListener('click', () => {
            DOM.profileModal.classList.remove('hidden');
            DOM.modalNickname.value = prof.nickname || '';
            DOM.modalBio.value = prof.bio || '';
            DOM.modalEmojiDisplay.textContent = prof.emoji || '👤';
            DOM.emojiPicker.classList.add('hidden');
        });
        document.getElementById('followBtn')?.addEventListener('click', function() { toggleFollow(userId, this); });

        const { data: posts } = await supabase.from('posts').select('*').eq('user_id', userId).order('created_at', { ascending: false });
        const feed = document.getElementById('profilePostsFeed');
        if (feed) {
            feed.innerHTML = posts?.length ? '' : '<p style="color:#555;">Нет постов</p>';
            posts?.forEach(post => { const c = createPostCard(post); if (c) feed.appendChild(c); });
        }
    }

    // ========== POST CARD ==========
    function createPostCard(post) {
        if (bannedUserIds.has(post.user_id)) return null;
        const card = document.createElement('div'); card.className = 'post-card';
        card.dataset.postId = post.id; card.dataset.userId = post.user_id;
        const emoji = post.emoji || '👤';
        let media = '';
        if (post.image_url) media += `<div class="post-card-img"><img src="${esc(post.image_url)}" style="max-height:300px;object-fit:cover;"></div>`;
        if (post.video_url) media += `<div class="post-card-video"><video controls src="${esc(post.video_url)}" style="max-height:300px;"></video></div>`;
        card.innerHTML = `
            <div class="post-card-header">
                <div class="post-card-avatar" data-user-id="${post.user_id}">${esc(emoji)}</div>
                <div><span class="post-card-nickname" data-user-id="${post.user_id}">${esc(post.nickname||'Гость')}</span><span class="post-card-time">${fmtDate(post.created_at)}</span></div>
            </div>
            ${post.content?`<div class="post-card-text">${esc(post.content)}</div>`:''}${media}
            <div class="post-card-actions"><button class="like-btn ${likedPostIds.has(post.id)?'liked':''}"><i class="fa-solid fa-heart"></i> <span>${post.likes||0}</span></button></div>`;
        card.querySelector('.post-card-avatar').addEventListener('click', () => openProfile(post.user_id));
        card.querySelector('.post-card-nickname').addEventListener('click', () => openProfile(post.user_id));
        card.querySelector('.like-btn').addEventListener('click', () => toggleLike(post.id, card.querySelector('.like-btn')));
        return card;
    }
    async function toggleLike(pid, btn) {
        if (!currentUser) return;
        const liked = likedPostIds.has(pid);
        likedPostIds[liked?'delete':'add'](pid);
        btn.classList.toggle('liked', !liked);
        btn.querySelector('span').textContent = parseInt(btn.querySelector('span').textContent) + (liked?-1:1);
        if (liked) await supabase.from('likes').delete().match({post_id:pid,user_id:currentUser.id});
        else await supabase.from('likes').insert({post_id:pid,user_id:currentUser.id});
    }

    async function loadPosts() {
        DOM.feedLoading.classList.remove('hidden'); DOM.feedEmpty.classList.add('hidden');
        const { data } = await supabase.from('posts').select('*').order('created_at',{ascending:false});
        DOM.postsFeed.querySelectorAll('.post-card').forEach(c=>c.remove());
        DOM.feedLoading.classList.add('hidden');
        if (!data||!data.length) { DOM.feedEmpty.classList.remove('hidden'); return; }
        data.forEach(p => { const c = createPostCard(p); if(c) DOM.postsFeed.appendChild(c); });
    }
    async function loadMyPosts() {
        if (!currentUser) return;
        DOM.myPostsLoading.classList.remove('hidden'); DOM.myPostsEmpty.classList.add('hidden');
        const { data } = await supabase.from('posts').select('*').eq('user_id', currentUser.id).order('created_at',{ascending:false});
        DOM.myPostsFeed.querySelectorAll('.post-card').forEach(c=>c.remove());
        DOM.myPostsLoading.classList.add('hidden');
        if (!data||!data.length) { DOM.myPostsEmpty.classList.remove('hidden'); return; }
        data.forEach(p => { const c = createPostCard(p); if(c) DOM.myPostsFeed.appendChild(c); });
    }
    async function loadFollowingPosts() {
        if (!currentUser) return;
        DOM.followingLoading.classList.remove('hidden'); DOM.followingEmpty.classList.add('hidden');
        const { data: follows } = await supabase.from('followers').select('following_id').eq('follower_id', currentUser.id);
        const ids = follows?.map(f => f.following_id) || [];
        if (!ids.length) { DOM.followingEmpty.classList.remove('hidden'); DOM.followingLoading.classList.add('hidden'); return; }
        const { data } = await supabase.from('posts').select('*').in('user_id', ids).order('created_at', { ascending: false });
        DOM.followingFeed.querySelectorAll('.post-card').forEach(c=>c.remove());
        DOM.followingLoading.classList.add('hidden');
        if (!data||!data.length) { DOM.followingEmpty.classList.remove('hidden'); return; }
        data.forEach(p => { const c = createPostCard(p); if(c) DOM.followingFeed.appendChild(c); });
    }
    async function loadVideoPosts() {
        DOM.videoLoading.classList.remove('hidden'); DOM.videoEmpty.classList.add('hidden');
        const { data } = await supabase.from('posts').select('*').not('video_url', 'is', null).order('created_at', { ascending: false });
        DOM.videoFeed.querySelectorAll('.post-card').forEach(c=>c.remove());
        DOM.videoLoading.classList.add('hidden');
        if (!data||!data.length) { DOM.videoEmpty.classList.remove('hidden'); return; }
        data.forEach(p => { const c = createPostCard(p); if(c) DOM.videoFeed.appendChild(c); });
    }

    // ========== PUBLISH ==========
    async function publish() {
        if (isPublishing || !currentUser) return;
        const txt = DOM.postTextarea.value.trim();
        if (!txt && !selectedImage && !selectedVideo) return;
        isPublishing = true; DOM.publishBtn.disabled = true;
        try {
            let imageUrl = null, videoUrl = null;
            if (selectedImage) {
                const path = `posts/${currentUser.id}_img_${Date.now()}.${selectedImage.name.split('.').pop()}`;
                await supabase.storage.from('post-images').upload(path, selectedImage);
                imageUrl = supabase.storage.from('post-images').getPublicUrl(path).data.publicUrl;
            }
            if (selectedVideo) {
                const path = `posts/${currentUser.id}_vid_${Date.now()}.${selectedVideo.name.split('.').pop()}`;
                await supabase.storage.from('post-images').upload(path, selectedVideo);
                videoUrl = supabase.storage.from('post-images').getPublicUrl(path).data.publicUrl;
            }
            await supabase.from('posts').insert({
                user_id: currentUser.id, nickname: profile?.nickname || currentUser.email?.split('@')[0],
                content: txt, likes: 0, image_url: imageUrl, video_url: videoUrl, emoji: profile?.emoji || '👤'
            });
            DOM.postTextarea.value = ''; clearMediaPreviews(); DOM.charCounter.textContent = '0 / 500'; loadPosts();
        } catch(e) { console.error(e); }
        isPublishing = false; updatePublishBtn();
    }
    function clearMediaPreviews() {
        selectedImage = null; selectedVideo = null;
        DOM.imagePreview.classList.add('hidden'); DOM.videoPreview.classList.add('hidden');
        DOM.previewImg.src = ''; DOM.previewVideo.src = '';
    }
    function updatePublishBtn() {
        const blocked = bannedUserIds.has(currentUser?.id);
        const canPost = (DOM.postTextarea?.value?.trim()?.length > 0) || selectedImage || selectedVideo;
        DOM.publishBtn.disabled = blocked || !canPost || isPublishing;
        if (blocked) { DOM.composerError.classList.remove('hidden'); DOM.composerErrorText.textContent = 'Вы заблокированы'; }
        else DOM.composerError.classList.add('hidden');
    }

    // Медиа-кнопки
    $('attachImageBtn').addEventListener('click', () => $('imageInput').click());
    $('imageInput').addEventListener('change', (e) => {
        if (e.target.files[0]) { selectedImage = e.target.files[0]; selectedVideo = null; const r = new FileReader(); r.onload = ev => { DOM.previewImg.src = ev.target.result; DOM.imagePreview.classList.remove('hidden'); DOM.videoPreview.classList.add('hidden'); }; r.readAsDataURL(e.target.files[0]); updatePublishBtn(); }
    });
    $('removeImagePreview').addEventListener('click', () => { selectedImage = null; DOM.imagePreview.classList.add('hidden'); updatePublishBtn(); });
    $('attachVideoBtn').addEventListener('click', () => $('videoInput').click());
    $('videoInput').addEventListener('change', (e) => {
        if (e.target.files[0]) { selectedVideo = e.target.files[0]; selectedImage = null; DOM.previewVideo.src = URL.createObjectURL(e.target.files[0]); DOM.videoPreview.classList.remove('hidden'); DOM.imagePreview.classList.add('hidden'); updatePublishBtn(); }
    });
    $('removeVideoPreview').addEventListener('click', () => { selectedVideo = null; DOM.videoPreview.classList.add('hidden'); updatePublishBtn(); });

    // ========== BANS & LIKES ==========
    async function loadBans() { const { data } = await supabase.from('banned_users').select('user_id'); bannedUserIds = new Set(data ? data.map(r => r.user_id) : []); updatePublishBtn(); }
    async function loadLikes() { if (!currentUser) return; const { data } = await supabase.from('likes').select('post_id').eq('user_id', currentUser.id); likedPostIds = new Set(data ? data.map(r => r.post_id) : []); }

    // ========== ADMIN ==========
    function setupAdmin() {
        const fab = document.createElement('button'); fab.className = 'admin-fab'; fab.innerHTML = '<i class="fa-solid fa-shield-halved"></i>'; document.body.appendChild(fab);
        const panel = document.createElement('div'); panel.className = 'admin-panel';
        panel.innerHTML = `<h3>Админ</h3><input type="password" id="adminPw" placeholder="Пароль"><button class="admin-login-btn" id="adminLogin">Войти</button><div id="adminErr" style="color:red;display:none;">Неверный</div><div id="bannedList" style="margin-top:10px;"></div>`;
        document.body.appendChild(panel);
        fab.addEventListener('click', () => panel.classList.toggle('active'));
        $('adminLogin').addEventListener('click', async () => {
            if ($('adminPw').value === 'nobuadmin2024') { isAdmin = true; panel.classList.remove('active'); await renderBanned(); addAdminButtons(); }
        });
        async function renderBanned() {
            const { data } = await supabase.from('banned_users').select('*');
            const list = $('bannedList'); list.innerHTML = '<h4>Заблокированные</h4>';
            if (!data||!data.length) { list.innerHTML += '<p>Нет</p>'; return; }
            data.forEach(e => {
                const row = document.createElement('div'); row.style.cssText = 'display:flex;justify-content:space-between;padding:4px 0;';
                row.innerHTML = `<span>${esc(e.nickname||'?')}</span><button class="unban-btn">Разбанить</button>`;
                row.querySelector('.unban-btn').addEventListener('click', async () => { await supabase.from('banned_users').delete().match({user_id:e.user_id}); bannedUserIds.delete(e.user_id); loadPosts(); renderBanned(); });
                list.appendChild(row);
            });
        }
    }
    function addAdminButtons() {
        document.querySelectorAll('.post-card').forEach(card => {
            if (card.querySelector('.admin-delete-btn')) return;
            const h = card.querySelector('.post-card-header');
            const d = document.createElement('button'); d.className = 'admin-delete-btn'; d.innerHTML = '<i class="fa-solid fa-trash"></i>'; d.style.cssText = 'background:none;border:none;color:#666;cursor:pointer;margin-left:auto;';
            d.addEventListener('click', async () => { if(confirm('Удалить?')){ await supabase.from('posts').delete().match({id:card.dataset.postId}); card.remove(); } });
            h.appendChild(d);
            const b = document.createElement('button'); b.className = 'admin-block-btn'; b.innerHTML = '<i class="fa-solid fa-ban"></i>'; b.style.cssText = 'background:none;border:none;color:#666;cursor:pointer;';
            b.addEventListener('click', async () => {
                if(confirm(`Заблокировать ${card.querySelector('.post-card-nickname').textContent}?`)){
                    await supabase.from('banned_users').upsert({user_id:card.dataset.userId,nickname:card.querySelector('.post-card-nickname').textContent});
                    bannedUserIds.add(card.dataset.userId);
                    document.querySelectorAll(`.post-card[data-user-id="${card.dataset.userId}"]`).forEach(c=>c.remove());
                    renderBanned();
                }
            });
            h.appendChild(b);
        });
    }

    // ========== INIT ==========
    function initApp() {
        loadBans(); loadLikes(); loadPosts(); setupAdmin();
        DOM.postTextarea.addEventListener('input', () => { DOM.charCounter.textContent = DOM.postTextarea.value.length + ' / 500'; updatePublishBtn(); });
        DOM.publishBtn.addEventListener('click', publish);
        $('retryBtn').addEventListener('click', loadPosts);
        setInterval(() => { if (currentScreen === 'home') loadPosts(); }, 5000);
        setInterval(loadBans, 10000);
        supabase.channel('posts').on('postgres_changes',{event:'INSERT',schema:'public',table:'posts'}, () => {
            if (currentScreen === 'home') loadPosts();
            else if (currentScreen === 'myPosts') loadMyPosts();
            else if (currentScreen === 'following') loadFollowingPosts();
            else if (currentScreen === 'video') loadVideoPosts();
        }).subscribe();
        switchScreen('home');
    }

    checkSession();
})();