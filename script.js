(function() {
    'use strict';

    const supabase = window.supabase.createClient(
        'https://iljsednetiogjtowlexo.supabase.co',
        'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O'
    );

    // ==================== DOM CACHE ====================
    const DOM = {
        // Profile
        profileBadge: document.getElementById('profileBadge'),
        profileAvatar: document.getElementById('profileAvatar'),
        profileInitial: document.getElementById('profileInitial'),
        profileName: document.getElementById('profileName'),
        profileEditBtn: document.getElementById('profileEditBtn'),
        profileEditorOverlay: document.getElementById('profileEditorOverlay'),
        profileEditorAvatar: document.getElementById('profileEditorAvatar'),
        profileEditorInitial: document.getElementById('profileEditorInitial'),
        avatarFileInput: document.getElementById('avatarFileInput'),
        nicknameInput: document.getElementById('nicknameInput'),
        cancelProfileBtn: document.getElementById('cancelProfileBtn'),
        saveProfileBtn: document.getElementById('saveProfileBtn'),
        profileEditorError: document.getElementById('profileEditorError'),
        // Composer
        composerAvatar: document.getElementById('composerAvatar'),
        composerInitial: document.getElementById('composerInitial'),
        composerLabel: document.getElementById('composerLabel'),
        postTextarea: document.getElementById('postTextarea'),
        charCounter: document.getElementById('charCounter'),
        publishBtn: document.getElementById('publishBtn'),
        attachImageBtn: document.getElementById('attachImageBtn'),
        imageFileInput: document.getElementById('imageFileInput'),
        imagePreviewContainer: document.getElementById('imagePreviewContainer'),
        imagePreview: document.getElementById('imagePreview'),
        removeImageBtn: document.getElementById('removeImageBtn'),
        composerError: document.getElementById('composerError'),
        composerErrorText: document.getElementById('composerErrorText'),
        // Feed
        postsFeed: document.getElementById('postsFeed'),
        feedLoading: document.getElementById('feedLoading'),
        feedEmpty: document.getElementById('feedEmpty'),
        feedError: document.getElementById('feedError'),
        retryBtn: document.getElementById('retryBtn'),
        statusDot: document.getElementById('statusDot'),
        statusText: document.getElementById('statusText'),
    };

    // ==================== STATE ====================
    const state = {
        userId: null,
        nickname: '',
        avatarUrl: null,
        isPublishing: false,
        isAdmin: false,
        likedPostIds: new Set(),
        bannedUserIds: new Set(),
        selectedImage: null,
    };

    // ==================== UTILS ====================
    const html = (strings, ...values) => {
        const escaped = values.map(v => {
            if (v === null || v === undefined) return '';
            return String(v).replace(/[&<>"']/g, m => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
            })[m]);
        });
        return strings.reduce((acc, str, i) => acc + str + (escaped[i] || ''), '');
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
        if (diff < 60) return 'только что';
        if (diff < 3600) return `${Math.floor(diff / 60)} мин. назад`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} ч. назад`;
        return new Date(dateStr).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    };

    const getOrCreateUserId = () => {
        let id = localStorage.getItem('nobu_user_id');
        if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
            id = crypto.randomUUID();
            localStorage.setItem('nobu_user_id', id);
        }
        return id;
    };

    // ==================== UI UPDATES ====================
    const updateProfileUI = () => {
        const name = state.nickname || 'Гость';
        const initial = name.charAt(0).toUpperCase();
        
        DOM.profileName.textContent = name;
        DOM.profileInitial.textContent = initial;
        DOM.composerInitial.textContent = initial;
        
        if (state.avatarUrl) {
            DOM.profileAvatar.style.backgroundImage = `url(${state.avatarUrl})`;
            DOM.profileAvatar.classList.add('has-image');
            DOM.profileInitial.textContent = '';
            DOM.composerAvatar.style.backgroundImage = `url(${state.avatarUrl})`;
            DOM.composerAvatar.style.backgroundSize = 'cover';
            DOM.composerInitial.textContent = '';
            DOM.profileEditorAvatar.style.backgroundImage = `url(${state.avatarUrl})`;
            DOM.profileEditorAvatar.classList.add('has-image');
            DOM.profileEditorInitial.textContent = '';
        } else {
            DOM.profileAvatar.style.backgroundImage = '';
            DOM.profileAvatar.classList.remove('has-image');
            DOM.profileInitial.textContent = initial;
            DOM.composerAvatar.style.backgroundImage = '';
            DOM.composerInitial.textContent = initial;
            DOM.profileEditorAvatar.style.backgroundImage = '';
            DOM.profileEditorAvatar.classList.remove('has-image');
            DOM.profileEditorInitial.textContent = initial;
        }
    };

    const updatePublishButton = () => {
        const hasContent = DOM.postTextarea.value.trim().length > 0 || state.selectedImage;
        const blocked = state.bannedUserIds.has(state.userId);
        DOM.publishBtn.disabled = blocked || !hasContent || state.isPublishing;
        
        if (blocked) {
            DOM.composerError.classList.remove('hidden');
            DOM.composerErrorText.textContent = 'Ваш аккаунт заблокирован';
        } else {
            DOM.composerError.classList.add('hidden');
        }
    };

    const updateCharCounter = () => {
        const len = DOM.postTextarea.value.length;
        DOM.charCounter.textContent = `${len} / 500`;
    };

    // ==================== DATA LAYER ====================
    const loadBannedUsers = async () => {
        const { data } = await supabase.from('banned_users').select('user_id');
        state.bannedUserIds = new Set(data ? data.map(r => r.user_id) : []);
        updatePublishButton();
    };

    const loadUserLikes = async () => {
        if (!state.userId) return;
        const { data } = await supabase.from('likes').select('post_id').eq('user_id', state.userId);
        state.likedPostIds = new Set(data ? data.map(r => r.post_id) : []);
    };

    const loadPosts = async () => {
        DOM.feedLoading.classList.remove('hidden');
        DOM.feedEmpty.classList.add('hidden');
        DOM.feedError.classList.add('hidden');
        
        const { data, error } = await supabase
            .from('posts')
            .select('*')
            .order('created_at', { ascending: false });
        
        DOM.postsFeed.querySelectorAll('.post-card').forEach(c => c.remove());
        DOM.feedLoading.classList.add('hidden');
        
        if (error || !data || data.length === 0) {
            DOM.feedEmpty.classList.remove('hidden');
            return;
        }
        
        data.forEach(post => {
            if (state.bannedUserIds.has(post.user_id)) return;
            const card = createPostCard(post);
            if (card) DOM.postsFeed.appendChild(card);
        });
    };

    const createPostCard = (post) => {
        const card = document.createElement('article');
        card.className = 'post-card';
        card.dataset.postId = post.id;
        card.dataset.userId = post.user_id;
        
        const isLiked = state.likedPostIds.has(post.id);
        
        card.innerHTML = `
            <div class="post-card-header">
                <div class="post-card-avatar">${html`${post.nickname?.charAt(0) || '?'}`}</div>
                <div class="post-card-author">
                    <span class="post-card-nickname">${html`${post.nickname || 'Гость'}`}</span>
                    <span class="post-card-time">${formatDate(post.created_at)}</span>
                </div>
            </div>
            ${post.content ? `<div class="post-card-content">${html`${post.content}`}</div>` : ''}
            ${post.image_url ? `<div class="post-card-image"><img src="${html`${post.image_url}`}" alt="Изображение" loading="lazy"></div>` : ''}
            <div class="post-card-actions">
                <button class="like-btn ${isLiked ? 'is-liked' : ''}" data-post-id="${post.id}">
                    <i class="fa-solid fa-heart"></i>
                    <span>${post.likes || 0}</span>
                </button>
            </div>
        `;
        
        const likeBtn = card.querySelector('.like-btn');
        likeBtn.addEventListener('click', () => toggleLike(post.id, likeBtn));
        
        return card;
    };

    const toggleLike = async (postId, btn) => {
        const isLiked = state.likedPostIds.has(postId);
        const countSpan = btn.querySelector('span');
        const currentCount = parseInt(countSpan.textContent, 10);
        
        if (isLiked) {
            state.likedPostIds.delete(postId);
            btn.classList.remove('is-liked');
            countSpan.textContent = Math.max(0, currentCount - 1);
            await supabase.from('likes').delete().match({ post_id: postId, user_id: state.userId });
        } else {
            state.likedPostIds.add(postId);
            btn.classList.add('is-liked');
            countSpan.textContent = currentCount + 1;
            await supabase.from('likes').insert({ post_id: postId, user_id: state.userId