(function() {
    const SUPABASE_URL = 'https://iljsednetiogjtowlexo.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

    const STORAGE_NICKNAME_KEY = 'nobu_nickname';
    const STORAGE_USER_ID_KEY = 'nobu_user_id';
    const STORAGE_VERIFIED_KEY = 'nobu_verified';
    const STORAGE_AVATAR_KEY = 'nobu_avatar';

    // ---- DOM ----
    const nicknameDisplay = document.getElementById('nicknameDisplay');
    const nicknameText = document.getElementById('nicknameText');
    const avatarInitial = document.getElementById('avatarInitial');
    const avatarCircle = document.getElementById('avatarCircle');
    const editNicknameBtn = document.getElementById('editNicknameBtn');
    const nicknameEditor = document.getElementById('nicknameEditor');
    const nicknameInput = document.getElementById('nicknameInput');
    const saveNicknameBtn = document.getElementById('saveNicknameBtn');
    const cancelNicknameBtn = document.getElementById('cancelNicknameBtn');
    const composerAvatar = document.querySelector('.composer-avatar'); // div
    const composerAvatarInitial = document.getElementById('composerAvatarInitial');
    const composerNickname = document.getElementById('composerNickname');
    const postTextarea = document.getElementById('postTextarea');
    const charCount = document.getElementById('charCount');
    const publishBtn = document.getElementById('publishBtn');
    const composerError = document.getElementById('composerError');
    const composerErrorText = document.getElementById('composerErrorText');
    const postsFeed = document.getElementById('postsFeed');
    const feedLoading = document.getElementById('feedLoading');
    const feedEmpty = document.getElementById('feedEmpty');
    const feedError = document.getElementById('feedError');
    const feedErrorText = document.getElementById('feedErrorText');
    const retryBtn = document.getElementById('retryBtn');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    let currentNickname = '';
    let currentUserId = '';
    let isPublishing = false;
    let realtimeSubscription = null;
    let postsRefreshInterval = null;
    let likedPostIds = new Set();
    let selectedImageFile = null;
    let isAdmin = false;
    let isVerified = false;
    let currentAvatarUrl = null;

    // ---- Композер фото ----
    const composerBody = document.querySelector('.composer-body');
    const toolbar = document.createElement('div');
    toolbar.className = 'composer-toolbar';
    const attachBtn = document.createElement('button');
    attachBtn.className = 'attach-btn';
    attachBtn.innerHTML = '<i class="fas fa-image"></i>';
    attachBtn.title = 'Прикрепить фото';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    const imagePreviewContainer = document.createElement('div');
    imagePreviewContainer.className = 'image-preview-container';
    const imagePreview = document.createElement('img');
    imagePreview.className = 'image-preview';
    imagePreview.alt = 'Превью';
    const removeImageBtn = document.createElement('button');
    removeImageBtn.className = 'remove-image-btn';
    removeImageBtn.innerHTML = '<i class="fas fa-times"></i>';
    removeImageBtn.title = 'Удалить фото';
    imagePreviewContainer.appendChild(imagePreview);
    imagePreviewContainer.appendChild(removeImageBtn);
    toolbar.appendChild(attachBtn);
    composerBody.insertBefore(imagePreviewContainer, composerBody.querySelector('.composer-footer'));
    composerBody.insertBefore(toolbar, imagePreviewContainer);

    // ---- Админка ----
    const ADMIN_PASSWORD = 'nobuadmin2024';
    let adminToggleBtn, adminModal;

    function createAdminUI() {
        adminToggleBtn = document.createElement('button');
        adminToggleBtn.className = 'admin-toggle-btn';
        adminToggleBtn.innerHTML = '<i class="fas fa-shield-haltered"></i>';
        document.body.appendChild(adminToggleBtn);

        adminModal = document.createElement('div');
        adminModal.className = 'admin-modal';
        adminModal.innerHTML = `
            <h3><i class="fas fa-crown"></i> Админ-панель</h3>
            <input type="password" class="admin-password-input" placeholder="Пароль..." id="adminPasswordInput">
            <button class="admin-login-btn" id="adminLoginBtn">Войти</button>
            <div class="admin-error" id="adminError">Неверный пароль</div>
        `;
        document.body.appendChild(adminModal);

        adminToggleBtn.addEventListener('click', () => {
            if (isAdmin) {
                isAdmin = false;
                adminToggleBtn.classList.remove('active');
                adminModal.classList.remove('active');
                removeDeleteButtons();
            } else {
                adminModal.classList.toggle('active');
            }
        });

        document.getElementById('adminLoginBtn').addEventListener('click', () => {
            const password = document.getElementById('adminPasswordInput').value;
            if (password === ADMIN_PASSWORD) {
                isAdmin = true;
                adminToggleBtn.classList.add('active');
                adminModal.classList.remove('active');
                document.getElementById('adminPasswordInput').value = '';
                document.getElementById('adminError').style.display = 'none';
                addDeleteButtons();
            } else {
                document.getElementById('adminError').style.display = 'block';
            }
        });

        document.getElementById('adminPasswordInput').addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('adminLoginBtn').click();
        });

        document.addEventListener('click', e => {
            if (!adminModal.contains(e.target) && e.target !== adminToggleBtn) {
                adminModal.classList.remove('active');
            }
        });
    }

    function addDeleteButtons() {
        document.querySelectorAll('.post-card').forEach(card => {
            if (!card.querySelector('.delete-post-btn')) {
                const header = card.querySelector('.post-header');
                const btn = document.createElement('button');
                btn.className = 'delete-post-btn';
                btn.innerHTML = '<i class="fas fa-trash"></i>';
                btn.addEventListener('click', async () => {
                    const postId = card.getAttribute('data-post-id');
                    if (confirm('Удалить пост?')) {
                        const { error } = await supabase.from('posts').delete().match({ id: postId });
                        if (!error) {
                            card.style.animation = 'fadeOut 0.3s ease forwards';
                            setTimeout(() => card.remove(), 300);
                        }
                    }
                });
                header.appendChild(btn);
            }
        });
    }

    function removeDeleteButtons() {
        document.querySelectorAll('.delete-post-btn').forEach(b => b.remove());
    }

    const styleEl = document.createElement('style');
    styleEl.textContent = '@keyframes fadeOut { to { opacity: 0; transform: scale(0.95); } }';
    document.head.appendChild(styleEl);

    // ---- Верификация ----
    function updateVerifiedUI() {
        // Обновляем галочку в композере
        if (isVerified) {
            if (!composerNickname.querySelector('.verified-badge')) {
                const badge = document.createElement('span');
                badge.className = 'verified-badge';
                badge.innerHTML = '<i class="fas fa-check"></i>';
                composerNickname.appendChild(badge);
            }
        } else {
            const badge = composerNickname.querySelector('.verified-badge');
            if (badge) badge.remove();
        }
    }

    // ---- Аватарка ----
    function saveAvatarUrl(url) {
        currentAvatarUrl = url;
        localStorage.setItem(STORAGE_AVATAR_KEY, url);
        applyAvatarToUI();
    }

    function loadAvatarUrl() {
        const saved = localStorage.getItem(STORAGE_AVATAR_KEY);
        if (saved) {
            currentAvatarUrl = saved;
            applyAvatarToUI();
        }
    }

    function applyAvatarToUI() {
        // Шапка
        if (currentAvatarUrl) {
            avatarCircle.style.backgroundImage = `url(${currentAvatarUrl})`;
            avatarCircle.classList.add('has-image');
            avatarInitial.textContent = '';
        } else {
            avatarCircle.style.backgroundImage = '';
            avatarCircle.classList.remove('has-image');
            avatarInitial.textContent = currentNickname ? currentNickname.charAt(0).toUpperCase() : '?';
        }
        // Композер
        if (currentAvatarUrl) {
            composerAvatar.style.backgroundImage = `url(${currentAvatarUrl})`;
            composerAvatar.style.backgroundSize = 'cover';
            composerAvatar.style.backgroundPosition = 'center';
            composerAvatarInitial.textContent = '';
        } else {
            composerAvatar.style.backgroundImage = '';
            composerAvatarInitial.textContent = currentNickname ? currentNickname.charAt(0).toUpperCase() : '?';
        }
        // Превью в редакторе
        const preview = document.getElementById('avatarPreviewInEditor');
        if (preview) {
            if (currentAvatarUrl) {
                preview.style.backgroundImage = `url(${currentAvatarUrl})`;
                preview.classList.add('has-image');
                preview.textContent = '';
            } else {
                preview.style.backgroundImage = '';
                preview.classList.remove('has-image');
                preview.textContent = currentNickname ? currentNickname.charAt(0).toUpperCase() : '?';
            }
        }
    }

    async function uploadAvatar(file) {
        const fileName = `avatars/${currentUserId}_avatar.${file.name.split('.').pop()}`;
        const { data, error } = await supabase.storage
            .from('post-images')
            .upload(fileName, file, { cacheControl: '3600', upsert: true });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(fileName);
        return urlData.publicUrl;
    }

    // ---- Утилиты ----
    function escapeHtml(text) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    function generateUserId() {
        return crypto.randomUUID();
    }

    function getUserId() {
        let userId = localStorage.getItem(STORAGE_USER_ID_KEY);
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!userId || !uuidRegex.test(userId)) {
            userId = generateUserId();
            localStorage.setItem(STORAGE_USER_ID_KEY, userId);
        }
        return userId;
    }

    function updateNicknameUI(nick) {
        const displayNick = nick || 'Гость';
        nicknameText.textContent = displayNick;
        composerNickname.textContent = displayNick;
        updateVerifiedUI();
        applyAvatarToUI();
        updatePublishButtonState();
    }

    function handleSaveNickname() {
        const newNick = nicknameInput.value.trim();
        if (!newNick) {
            nicknameInput.style.border = '1px solid var(--danger)';
            nicknameInput.focus();
            setTimeout(() => { nicknameInput.style.border = ''; }, 2000);
            return;
        }

        if (newNick === 'NobuSocial') {
            const password = prompt('Введите пароль для верификации NobuSocial:');
            if (password === 'NobuSocialAdmin2024') {
                isVerified = true;
                localStorage.setItem(STORAGE_VERIFIED_KEY, 'true');
            } else {
                isVerified = false;
                localStorage.setItem(STORAGE_VERIFIED_KEY, 'false');
                if (password !== null) alert('Неверный пароль! Верификация не применена.');
            }
        } else {
            isVerified = false;
            localStorage.setItem(STORAGE_VERIFIED_KEY, 'false');
        }

        currentNickname = newNick;
        localStorage.setItem(STORAGE_NICKNAME_KEY, newNick);
        updateNicknameUI(newNick);
        hideNicknameEditor();
        showComposerError('');
    }

    function handleCancelNickname() {
        if (!currentNickname) return;
        hideNicknameEditor();
        nicknameInput.style.border = '';
    }

    function showComposerError(msg) {
        if (msg) {
            composerError.classList.remove('hidden');
            composerErrorText.textContent = msg;
        } else {
            composerError.classList.add('hidden');
        }
    }

    function updateCharCounter() {
        const len = postTextarea.value.length;
        charCount.textContent = len;
        charCount.classList.remove('warning', 'danger');
        if (len >= 450 && len < 500) charCount.classList.add('warning');
        else if (len >= 500) charCount.classList.add('danger');
        updatePublishButtonState();
    }

    function updatePublishButtonState() {
        const hasContent = postTextarea.value.trim().length > 0 || selectedImageFile !== null;
        publishBtn.disabled = !(hasContent && currentNickname && !isPublishing);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '';
        const now = new Date();
        const diffSec = Math.floor((now - date) / 1000);
        if (diffSec < 60) return 'только что';
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin} мин. назад`;
        const diffHour = Math.floor(diffMin / 60);
        if (diffHour < 24) return `${diffHour} ч. назад`;
        const diffDay = Math.floor(diffHour / 24);
        if (diffDay < 7) return `${diffDay} дн. назад`;
        return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    }

    async function uploadPostImage(file) {
        const fileName = `post-images/${currentUserId}_${Date.now()}.${file.name.split('.').pop()}`;
        const { error } = await supabase.storage.from('post-images').upload(fileName, file, { cacheControl: '3600', upsert: false });
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('post-images').getPublicUrl(fileName);
        return urlData.publicUrl;
    }

    function createPostCard(post) {
        const card = document.createElement('div');
        card.className = 'post-card';
        card.setAttribute('data-post-id', post.id);

        const initial = post.nickname ? post.nickname.charAt(0).toUpperCase() : '?';
        const verifiedHtml = post.verified ? '<span class="verified-badge"><i class="fas fa-check"></i></span>' : '';
        const timeStr = formatDate(post.created_at);
        const isLiked = likedPostIds.has(post.id);
        const likesCount = post.likes || 0;

        let imageHtml = '';
        if (post.image_url) {
            imageHtml = `<div class="post-image"><img src="${escapeHtml(post.image_url)}" alt="Пост" loading="lazy" onclick="window.open('${escapeHtml(post.image_url)}', '_blank')"></div>`;
        }

        card.innerHTML = `
            <div class="post-header">
                <div class="post-avatar">${escapeHtml(initial)}</div>
                <div class="post-author-info">
                    <span class="post-nickname">${escapeHtml(post.nickname || 'Гость')}${verifiedHtml}</span>
                    <span class="post-time">${timeStr}</span>
                </div>
            </div>
            ${post.content ? `<div class="post-content">${escapeHtml(post.content)}</div>` : ''}
            ${imageHtml}
            <div class="post-actions">
                <button class="like-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}">
                    <i class="fas fa-heart"></i>
                    <span class="like-count">${likesCount}</span>
                </button>
            </div>
        `;

        card.querySelector('.like-btn').addEventListener('click', function() {
            toggleLike(post.id, this);
        });

        if (isAdmin) {
            const header = card.querySelector('.post-header');
            const delBtn = document.createElement('button');
            delBtn.className = 'delete-post-btn';
            delBtn.innerHTML = '<i class="fas fa-trash"></i>';
            delBtn.addEventListener('click', async () => {
                if (confirm('Удалить пост?')) {
                    await supabase.from('posts').delete().match({ id: post.id });
                    card.style.animation = 'fadeOut 0.3s ease forwards';
                    setTimeout(() => card.remove(), 300);
                }
            });
            header.appendChild(delBtn);
        }

        return card;
    }

    async function toggleLike(postId, button) {
        if (!currentUserId) return;
        const isLiked = likedPostIds.has(postId);
        const countEl = button.querySelector('.like-count');
        let count = parseInt(countEl.textContent || 0);

        if (isLiked) {
            likedPostIds.delete(postId);
            count = Math.max(0, count - 1);
            button.classList.remove('liked');
        } else {
            likedPostIds.add(postId);
            count++;
            button.classList.add('liked');
        }
        countEl.textContent = count;

        try {
            if (isLiked) {
                await supabase.from('likes').delete().match({ post_id: postId, user_id: currentUserId });
            } else {
                await supabase.from('likes').insert({ post_id: postId, user_id: currentUserId });
            }
        } catch (err) {
            console.error(err);
            // откат
            if (isLiked) {
                likedPostIds.add(postId);
                count++;
                button.classList.add('liked');
            } else {
                likedPostIds.delete(postId);
                count = Math.max(0, count - 1);
                button.classList.remove('liked');
            }
            countEl.textContent = count;
        }
    }

    async function loadUserLikes() {
        if (!currentUserId) return;
        const { data } = await supabase.from('likes').select('post_id').eq('user_id', currentUserId);
        if (data) likedPostIds = new Set(data.map(l => l.post_id));
    }

    function renderPosts(posts) {
        postsFeed.querySelectorAll('.post-card').forEach(c => c.remove());
        if (!posts || posts.length === 0) {
            feedLoading.classList.add('hidden');
            feedError.classList.add('hidden');
            feedEmpty.classList.remove('hidden');
            return;
        }
        feedLoading.classList.add('hidden');
        feedError.classList.add('hidden');
        feedEmpty.classList.add('hidden');
        posts.forEach(post => postsFeed.appendChild(createPostCard(post)));
    }

    function setFeedStatus(status, text) {
        statusDot.className = 'status-dot';
        if (status === 'connected') statusDot.classList.add('connected');
        else if (status === 'connecting') statusDot.classList.add('connecting');
        else if (status === 'error') statusDot.classList.add('error');
        statusText.textContent = text || '';
    }

    async function loadPosts() {
        try {
            setFeedStatus('connecting', 'Загрузка...');
            feedLoading.classList.remove('hidden');
            const { data, error } = await supabase.from('posts').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            renderPosts(data);
            setFeedStatus('connected', 'Активно');
        } catch (err) {
            feedLoading.classList.add('hidden');
            feedError.classList.remove('hidden');
            feedErrorText.textContent = 'Ошибка загрузки';
            setFeedStatus('error', 'Ошибка');
        }
    }

    async function publishPost() {
        if (isPublishing) return;
        const content = postTextarea.value.trim();
        if (!content && !selectedImageFile) {
            showComposerError('Пост не может быть пустым');
            return;
        }
        if (!currentNickname) {
            showComposerError('Задайте ник');
            return;
        }
        isPublishing = true;
        updatePublishButtonState();
        showComposerError('');

        try {
            let imageUrl = null;
            if (selectedImageFile) {
                publishBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка...';
                imageUrl = await uploadPostImage(selectedImageFile);
                publishBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Опубликовать';
            }

            const { data, error } = await supabase.from('posts').insert([{
                user_id: currentUserId,
                nickname: currentNickname,
                content: content || '',
                likes: 0,
                verified: isVerified,
                image_url: imageUrl || null
            }]).select().single();

            if (error) throw error;
            postTextarea.value = '';
            updateCharCounter();
            clearImagePreview();
            const card = createPostCard(data);
            const firstCard = postsFeed.querySelector('.post-card');
            if (firstCard) postsFeed.insertBefore(card, firstCard);
            else postsFeed.appendChild(card);
            feedEmpty.classList.add('hidden');
        } catch (err) {
            showComposerError('Ошибка публикации');
        } finally {
            isPublishing = false;
            updatePublishButtonState();
            publishBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Опубликовать';
        }
    }

    function clearImagePreview() {
        selectedImageFile = null;
        fileInput.value = '';
        imagePreview.src = '';
        imagePreviewContainer.classList.remove('active');
        updatePublishButtonState();
    }

    function handleImageSelect(file) {
        if (!file || !file.type.startsWith('image/')) return;
        if (file.size > 5 * 1024 * 1024) {
            showComposerError('Фото больше 5 МБ');
            return;
        }
        selectedImageFile = file;
        const reader = new FileReader();
        reader.onload = e => {
            imagePreview.src = e.target.result;
            imagePreviewContainer.classList.add('active');
            updatePublishButtonState();
        };
        reader.readAsDataURL(file);
    }

    function setupRealtime() {
        if (realtimeSubscription) supabase.removeChannel(realtimeSubscription);
        setFeedStatus('connecting', 'Realtime...');
        realtimeSubscription = supabase.channel('posts-channel')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, payload => {
                const card = createPostCard(payload.new);
                const first = postsFeed.querySelector('.post-card');
                if (first) postsFeed.insertBefore(card, first);
                else postsFeed.appendChild(card);
                feedEmpty.classList.add('hidden');
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, payload => {
                const updated = payload.new;
                const card = document.querySelector(`[data-post-id="${updated.id}"]`);
                if (card) {
                    const cnt = card.querySelector('.like-count');
                    if (cnt) cnt.textContent = updated.likes;
                }
            })
            .subscribe(status => {
                if (status === 'SUBSCRIBED') setFeedStatus('connected', 'Realtime активно');
                else if (status === 'CHANNEL_ERROR') setFeedStatus('error', 'Ошибка');
            });
    }

    function startPeriodicRefresh() {
        if (postsRefreshInterval) clearInterval(postsRefreshInterval);
        postsRefreshInterval = setInterval(loadPosts, 5000);
    }

    function stopPeriodicRefresh() {
        if (postsRefreshInterval) clearInterval(postsRefreshInterval);
    }

    // Добавляем интерфейс аватарки в редактор ника
    function enhanceNicknameEditor() {
        const editor = nicknameEditor;
        const avatarArea = document.createElement('div');
        avatarArea.className = 'avatar-upload-area';
        avatarArea.innerHTML = `
            <div class="current-avatar-preview" id="avatarPreviewInEditor"></div>
            <input type="file" id="avatarFileInput" accept="image/*" style="display:none">
            <button class="avatar-upload-btn" id="avatarUploadBtn"><i class="fas fa-camera"></i> Сменить аватар</button>
        `;
        editor.prepend(avatarArea);

        document.getElementById('avatarUploadBtn').addEventListener('click', () => {
            document.getElementById('avatarFileInput').click();
        });
        document.getElementById('avatarFileInput').addEventListener('change', async (e) => {
            if (e.target.files[0]) {
                try {
                    const url = await uploadAvatar(e.target.files[0]);
                    saveAvatarUrl(url);
                } catch (err) {
                    alert('Не удалось загрузить аватар');
                }
            }
        });
    }

    function showNicknameEditor() {
        nicknameDisplay.classList.add('hidden');
        nicknameEditor.classList.remove('hidden');
        nicknameInput.value = currentNickname;
        nicknameInput.focus();
        applyAvatarToUI(); // обновим превью
    }

    function hideNicknameEditor() {
        nicknameEditor.classList.add('hidden');
        nicknameDisplay.classList.remove('hidden');
    }

    async function init() {
        currentUserId = getUserId();
        currentNickname = localStorage.getItem(STORAGE_NICKNAME_KEY) || '';
        isVerified = localStorage.getItem(STORAGE_VERIFIED_KEY) === 'true';
        loadAvatarUrl();
        updateNicknameUI(currentNickname);
        if (!currentNickname) showNicknameEditor(); else hideNicknameEditor();
        updateCharCounter();

        editNicknameBtn.addEventListener('click', showNicknameEditor);
        saveNicknameBtn.addEventListener('click', handleSaveNickname);
        cancelNicknameBtn.addEventListener('click', handleCancelNickname);
        nicknameInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); handleSaveNickname(); }
            else if (e.key === 'Escape') handleCancelNickname();
        });
        postTextarea.addEventListener('input', () => { updateCharCounter(); showComposerError(''); });
        publishBtn.addEventListener('click', publishPost);
        attachBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => { if (e.target.files[0]) handleImageSelect(e.target.files[0]); });
        removeImageBtn.addEventListener('click', clearImagePreview);
        retryBtn.addEventListener('click', loadPosts);

        enhanceNicknameEditor();
        createAdminUI();

        await loadUserLikes();
        await loadPosts();
        setupRealtime();
        startPeriodicRefresh();
    }

    window.addEventListener('beforeunload', () => {
        stopPeriodicRefresh();
        if (realtimeSubscription) supabase.removeChannel(realtimeSubscription);
    });

    document.addEventListener('DOMContentLoaded', init);
})();