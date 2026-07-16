// === ТВОИ ДАННЫЕ SUPABASE ===
// Вставь сюда URL и anon key из твоего дашборда Supabase
const SUPABASE_URL = 'https://ТВОЙ_ПРОЕКТ.supabase.co';
const SUPABASE_KEY = 'ТВОЙ_ANON_KEY';

// Инициализация клиента
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// DOM элементы
const feedElement = document.getElementById('feed');
const inputElement = document.getElementById('chirp-input');
const postBtn = document.getElementById('post-btn');

// Запуск при загрузке
document.addEventListener('DOMContentLoaded', () => {
    fetchChirps();
    subscribeToNewChirps();
});

// Отправка нового поста
postBtn.addEventListener('click', async () => {
    const content = inputElement.value.trim();
    if (!content) return;

    postBtn.disabled = true;
    
    const { error } = await supabase
        .from('chirps')
        .insert([{ content: content }]);

    if (error) {
        console.error('Ошибка публикации:', error);
        alert('Не удалось отправить пост.');
    } else {
        inputElement.value = '';
    }
    
    postBtn.disabled = false;
});

// Загрузка существующих постов
async function fetchChirps() {
    const { data, error } = await supabase
        .from('chirps')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error('Ошибка загрузки ленты:', error);
        feedElement.innerHTML = '<div class="loader">Ошибка загрузки.</div>';
        return;
    }

    // Очищаем лоадер
    feedElement.innerHTML = '';
    
    if (data.length === 0) {
        feedElement.innerHTML = '<div class="loader">Здесь пока пусто. Напиши что-нибудь!</div>';
    } else {
        data.forEach(chirp => renderChirp(chirp));
    }
}

// Подписка на Realtime (новые посты будут появляться сами)
function subscribeToNewChirps() {
    supabase
        .channel('public:chirps')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chirps' }, payload => {
            // Убираем заглушку, если это первый пост
            const loader = feedElement.querySelector('.loader');
            if (loader) loader.remove();
            
            // Добавляем новый пост в самое начало (анимация сработает из CSS)
            renderChirp(payload.new, true);
        })
        .subscribe();
}

// Отрисовка HTML одного поста
function renderChirp(chirp, prepend = false) {
    const chirpDiv = document.createElement('div');
    chirpDiv.className = 'chirp';
    
    // Форматируем дату
    const date = new Date(chirp.created_at);
    const timeString = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

    chirpDiv.innerHTML = `
        <div class="chirp-header">
            <div class="avatar"></div>
            <div class="author">Anonymous</div>
            <div class="time">${timeString}</div>
        </div>
        <div class="content">
            ${escapeHTML(chirp.content)}
        </div>
    `;

    if (prepend) {
        feedElement.prepend(chirpDiv);
    } else {
        feedElement.appendChild(chirpDiv);
    }
}

// Защита от XSS (чтобы пользователи не могли вставить зловредный код)
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
