(function() {
    const SUPABASE_URL = 'https://iljsednetiogjtowlexo.supabase.co';
    const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_gXxOqmU-XXnrVz8FHro2jA_ybG9EQ7O';

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

    const STORAGE_NICKNAME_KEY = 'nobu_nickname';
    const STORAGE_USER_ID_KEY = 'nobu_user_id';

    const nicknameDisplay = document.getElementById('nicknameDisplay');
    const nicknameText = document.getElementById('nicknameText');
    const avatarInitial = document.getElementById('avatarInitial');
    const editNicknameBtn = document.getElementById('editNicknameBtn');
    const nicknameEditor = document.getElementById('nicknameEditor');
    const nicknameInput = document.getElementById('nicknameInput');
    const saveNicknameBtn = document.getElementById('saveNicknameBtn');
    const cancelNicknameBtn = document.getElementById('cancelNicknameBtn');
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

    // Создаём элементы для фото в композере динамически
    const postComposer = document.querySelector('.post-composer');
    const composerBody = postComposer.querySelector('.composer-body');
    
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

    function getSavedNickname() {
        return localStorage.getItem(STORAGE_NICKNAME_KEY) || '';
    }

    function saveNickname(nick) {
        localStorage.setItem(STORAGE_NICKNAME_KEY, nick);
    }

    function updateNicknameUI(nick) {
        const displayNick = nick || 'Гость';
        const initial = nick ? nick.charAt(0).toUpperCase() : '?';
        nicknameText.textContent = displayNick;
        avatarInitial.textContent = initial;
        composerNickname.textContent = displayNick;
        composerAvatarInitial.textContent = initial;
        updatePublishButtonState();
    }

    function showNicknameEditor() {
        nicknameDisplay.classList.add('hidden');
        nicknameEditor.classList.remove('hidden');
        nicknameInput.value = currentNickname;
        nicknameInput.focus();
    }

    function hideNicknameEditor() {
        nicknameEditor.classList.add('hidden');
        nicknameDisplay.classList.remove('hidden');
    }

    function handleSaveNickname() {
        const newNick = nicknameInput.value.trim();
        if (!newNick) {
            nicknameInput.style.border = '1px solid var(--danger)';
            nicknameInput.focus();
            setTimeout(() => { nicknameInput.style.border = ''; }, 2000);
            return;
        }
        currentNickname = newNick;
        saveNickname(currentNickname);
        updateNicknameUI(currentNickname);
        hideNicknameEditor();
        showComposerError('');
    }

    function handleCancelNickname() {
        if (!currentNickname) return;
        hideNicknameEditor();
        nicknameInput.style.border = '';
    }

    function showComposerError(message) {
        if (message) {
            composerError.classList.remove('hidden');
            composerErrorText.textContent = message;
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
        const hasNickname = currentNickname && currentNickname.length > 0;
        publishBtn.disabled = !(hasContent && hasNickname && !isPublishing);
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

    async function uploadImage(file) {
        const fileName = `${currentUserId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${file.name.split('.').pop()}`;
        const filePath = `post-images/${fileName}`;

        const { data, error } = await supabase.storage
            .from('post-images')
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            console.error('Ошибка загрузки изображения:', error);
            throw error;
        }

        const { data: urlData } = supabase.storage
            .from('post-images')
            .getPublicUrl(filePath);

        return urlData.publicUrl;
    }

    function createPostCard(post) {
        const card = document.createElement('div');
        card.className = 'post-card';
        card.setAttribute('data-post-id', post.id);

        const initial = post.nickname ? post.nickname.charAt(0).toUpperCase() : '?';
        const safeContent = escapeHtml(post.content || '');
        const timeStr = formatDate(post.created_at);
        const isLiked = likedPostIds.has(post.id);
        const likesCount = post.likes || 0;

        let imageHtml = '';
        if (post.image_url) {
            imageHtml = `
                <div class="post-image">
                    <img src="${escapeHtml(post.image_url)}" alt="Изображение к посту" loading="lazy" onclick="window.open('${escapeHtml(post.image_url)}', '_blank')">
                </div>
            `;
        }

        card.innerHTML = `
            <div class="post-header">
                <div class="post-avatar">${escapeHtml(initial)}</div>
                <div class="post-author-info">
                    <span class="post-nickname">${escapeHtml(post.nickname || 'Гость')}</span>
                    <span class="post-time">${timeStr}</span>
                </div>
            </div>
            ${post.content ? `<div class="post-content">${safeContent}</div>` : ''}
            ${imageHtml}
            <div class="post-actions">
                <button class="like-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}">
                    <i class="fas fa-heart"></i>
                    <span class="like-count">${likesCount}</span>
                </button>
            </div>
        `;

        const likeBtn = card.querySelector('.like-btn');
        likeBtn.addEventListener('click', () => toggleLike(post.id, likeBtn));

        return card;
    }

    function updateLikeButton(button, isLiked, likesCount) {
        if (isLiked) {
            button.classList.add('liked');
        } else {
            button.classList.remove('liked');
        }
        const countSpan = button.querySelector('.like-count');
        if (countSpan) countSpan.textContent = likesCount;
    }

    async function toggleLike(postId, button) {
        if (!currentUserId) return;

        const isCurrentlyLiked = likedPostIds.has(postId);
        const newLikedState = !isCurrentlyLiked;
        const currentCountEl = button.querySelector('.like-count');
        let currentCount = parseInt(currentCountEl?.textContent || 0, 10);

        if (newLikedState) {
            likedPostIds.add(postId);
            currentCount++;
        } else {
            likedPostIds.delete(postId);
            currentCount = Math.max(0, currentCount - 1);
        }
        updateLikeButton(button, newLikedState, currentCount);

        try {
            if (newLikedState) {
                const { error } = await supabase
                    .from('likes')
                    .insert({ post_id: postId, user_id: currentUserId });
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('likes')
                    .delete()
                    .match({ post_id: postId, user_id: currentUserId });
                if (error) throw error;
            }
        } catch (err) {
            console.error('Ошибка переключения лайка:', err);
            if (newLikedState) {
                likedPostIds.delete(postId);
                currentCount = Math.max(0, currentCount - 1);
            } else {
                likedPostIds.add(postId);
                currentCount++;
            }
            updateLikeButton(button, !newLikedState, currentCount);
        }
    }

    async function loadUserLikes() {
        if (!currentUserId) return;
        try {
            const { data, error } = await supabase
                .from('likes')
                .select('post_id')
                .eq('user_id', currentUserId);
            if (error) throw error;
            likedPostIds = new Set(data.map(like => like.post_id));
        } catch (err) {
            console.error('Ошибка загрузки лайков:', err);
            likedPostIds = new Set();
        }
    }

    function renderPosts(posts) {
        const existingCards = postsFeed.querySelectorAll('.post-card');
        existingCards.forEach(card => card.remove());

        if (!posts || posts.length === 0) {
            feedLoading.classList.add('hidden');
            feedError.classList.add('hidden');
            feedEmpty.classList.remove('hidden');
            return;
        }

        feedLoading.classList.add('hidden');
        feedError.classList.add('hidden');
        feedEmpty.classList.add('hidden');

        posts.forEach(post => {
            const card = createPostCard(post);
            postsFeed.appendChild(card);
        });
    }

    function setFeedStatus(status, text) {
        statusDot.className = 'status-dot';
        if (status === 'connected') {
            statusDot.classList.add('connected');
            statusText.textContent = text || 'Подключено';
        } else if (status === 'connecting') {
            statusDot.classList.add('connecting');
            statusText.textContent = text || 'Подключение...';
        } else if (status === 'error') {
            statusDot.classList.add('error');
            statusText.textContent = text || 'Ошибка';
        } else {
            statusText.textContent = text || '';
        }
    }

    async function loadPosts() {
        try {
            setFeedStatus('connecting', 'Загрузка...');
            feedLoading.classList.remove('hidden');
            feedError.classList.add('hidden');
            feedEmpty.classList.add('hidden');

            const { data, error } = await supabase
                .from('posts')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Ошибка загрузки постов:', error);
                throw error;
            }

            console.log('Загружено постов:', data?.length || 0);
            renderPosts(data || []);
            setFeedStatus('connected', 'Активно');
        } catch (err) {
            console.error('Критическая ошибка загрузки постов:', err);
            feedLoading.classList.add('hidden');
            feedError.classList.remove('hidden');
            feedErrorText.textContent = `Не удалось загрузить посты. ${err.message || ''}`;
            setFeedStatus('error', 'Ошибка загрузки');
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
            showComposerError('Сначала задайте никнейм');
            return;
        }
        if (content.length > 500) {
            showComposerError('Максимальная длина 500 символов');
            return;
        }

        isPublishing = true;
        updatePublishButtonState();
        showComposerError('');

        try {
            let imageUrl = null;
            
            // Загружаем фото если есть
            if (selectedImageFile) {
                publishBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Загрузка...</span>';
                imageUrl = await uploadImage(selectedImageFile);
                publishBtn.innerHTML = '<i class="fas fa-paper-plane"></i> <span>Опубликовать</span>';
            }

            const postData = {
                user_id: currentUserId,
                nickname: currentNickname,
                content: content || '',
                likes: 0
            };

            if (imageUrl) {
                postData.image_url = imageUrl;
            }

            const { data, error } = await supabase
                .from('posts')
                .insert([postData])
                .select()
                .single();

            if (error) {
                console.error('Ошибка публикации:', error);
                throw error;
            }

            console.log('Пост опубликован:', data);
            
            // Очищаем форму
            postTextarea.value = '';
            updateCharCounter();
            clearImagePreview();

            if (data) {
                const card = createPostCard(data);
                const firstCard = postsFeed.querySelector('.post-card');
                if (firstCard) postsFeed.insertBefore(card, firstCard);
                else postsFeed.appendChild(card);
                feedEmpty.classList.add('hidden');
            }
        } catch (err) {
            console.error('Критическая ошибка при публикации:', err);
            let msg = 'Не удалось опубликовать пост.';
            if (err.message) msg += ' ' + err.message;
            showComposerError(msg);
        } finally {
            isPublishing = false;
            updatePublishButtonState();
            publishBtn.innerHTML = '<i class="fas fa-paper-plane"></i> <span>Опубликовать</span>';
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
        if (!file || !file.type.startsWith('image/')) {
            showComposerError('Пожалуйста, выберите изображение');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            showComposerError('Размер фото не должен превышать 5 МБ');
            return;
        }

        selectedImageFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.src = e.target.result;
            imagePreviewContainer.classList.add('active');
            updatePublishButtonState();
        };
        reader.readAsDataURL(file);
        showComposerError('');
    }

    function setupRealtime() {
        if (realtimeSubscription) {
            supabase.removeChannel(realtimeSubscription);
        }
        setFeedStatus('connecting', 'Подключение realtime...');

        realtimeSubscription = supabase
            .channel('posts-channel')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, payload => {
                console.log('Realtime insert:', payload);
                const newPost = payload.new;
                const existingCard = document.querySelector(`[data-post-id="${newPost.id}"]`);
                if (!existingCard) {
                    const card = createPostCard(newPost);
                    const firstCard = postsFeed.querySelector('.post-card');
                    if (firstCard) postsFeed.insertBefore(card, firstCard);
                    else postsFeed.appendChild(card);
                    feedEmpty.classList.add('hidden');
                    feedLoading.classList.add('hidden');
                    feedError.classList.add('hidden');
                }
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'posts' }, payload => {
                console.log('Realtime update:', payload);
                const updatedPost = payload.new;
                const card = document.querySelector(`[data-post-id="${updatedPost.id}"]`);
                if (card) {
                    const likeBtn = card.querySelector('.like-btn');
                    if (likeBtn) {
                        const countEl = likeBtn.querySelector('.like-count');
                        if (countEl) countEl.textContent = updatedPost.likes;
                    }
                }
            })
            .subscribe(status => {
                console.log('Realtime status:', status);
                if (status === 'SUBSCRIBED') setFeedStatus('connected', 'Realtime активно');
                else if (status === 'CHANNEL_ERROR') setFeedStatus('error', 'Ошибка realtime');
                else if (status === 'TIMED_OUT') setFeedStatus('error', 'Таймаут realtime');
            });
    }

    function startPeriodicRefresh() {
        if (postsRefreshInterval) clearInterval(postsRefreshInterval);
        postsRefreshInterval = setInterval(loadPosts, 5000);
    }

    function stopPeriodicRefresh() {
        if (postsRefreshInterval) {
            clearInterval(postsRefreshInterval);
            postsRefreshInterval = null;
        }
    }

    async function init() {
        currentUserId = getUserId();
        currentNickname = getSavedNickname();
        updateNicknameUI(currentNickname);
        if (!currentNickname) showNicknameEditor();
        else hideNicknameEditor();
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
        postTextarea.addEventListener('keydown', e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); publishPost(); }
        });
        retryBtn.addEventListener('click', loadPosts);

        // Обработчики для фото
        attachBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleImageSelect(e.target.files[0]);
            }
        });
        removeImageBtn.addEventListener('click', clearImagePreview);

        await loadUserLikes();
        await loadPosts();

        setupRealtime();
        startPeriodicRefresh();
    }

    window.addEventListener('beforeunload', () => {
        stopPeriodicRefresh();
        if (realtimeSubscription) supabase.removeChannel(realtimeSubscription);
    });

 // АДМИНКА
const ADMIN_PASSWORD = 'nobuadmin2024';
let isAdmin = false;
let adminModal = null;
let adminToggleBtn = null;

function createAdminUI() {
    // Кнопка
    adminToggleBtn = document.createElement('button');
    adminToggleBtn.className = 'admin-toggle-btn';
    adminToggleBtn.innerHTML = '<i class="fas fa-shield-haltered"></i>';
    adminToggleBtn.title = 'Админка';
    document.body.appendChild(adminToggleBtn);

    // Модалка
    adminModal = document.createElement('div');
    adminModal.className = 'admin-modal';
    adminModal.innerHTML = `
        <h3><i class="fas fa-crown"></i> Админ-панель</h3>
        <input type="password" class="admin-password-input" placeholder="Пароль..." id="adminPasswordInput">
        <button class="admin-login-btn" id="adminLoginBtn">Войти</button>
        <div class="admin-error" id="adminError">Неверный пароль</div>
    `;
    document.body.appendChild(adminModal);

    // Обработчики
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

    document.getElementById('adminPasswordInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('adminLoginBtn').click();
        }
    });

    // Закрытие по клику вне
    document.addEventListener('click', (e) => {
        if (!adminModal.contains(e.target) && e.target !== adminToggleBtn) {
            adminModal.classList.remove('active');
        }
    });
}

function addDeleteButtons() {
    document.querySelectorAll('.post-card').forEach(card => {
        if (!card.querySelector('.delete-post-btn')) {
            const header = card.querySelector('.post-header');
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-post-btn';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.title = 'Удалить пост';
            deleteBtn.addEventListener('click', async () => {
                const postId = card.getAttribute('data-post-id');
                if (confirm('Точно удалить этот пост?')) {
                    const { error } = await supabase
                        .from('posts')
                        .delete()
                        .match({ id: postId });
                    if (!error) {
                        card.style.animation = 'fadeOut 0.3s ease forwards';
                        setTimeout(() => card.remove(), 300);
                    }
                }
            });
            header.appendChild(deleteBtn);
        }
    });
}

function removeDeleteButtons() {
    document.querySelectorAll('.delete-post-btn').forEach(btn => btn.remove());
}

// Стиль для анимации удаления
const styleEl = document.createElement('style');
styleEl.textContent = '@keyframes fadeOut { to { opacity: 0; transform: scale(0.95); } }';
document.head.appendChild(styleEl);

document.addEventListener('DOMContentLoaded', init);
})();