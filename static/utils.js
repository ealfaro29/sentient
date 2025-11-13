// static/utils.js

export const LAYOUTS = [
    { id: 'layout-standard', name: 'Standard (Bottom Left)', short: 'STD' },
    { id: 'layout-centered', name: 'Centered (Middle)', short: 'CTR' },
    { id: 'layout-bold', name: 'Bold (Top Left)', short: 'BLD' }
];

export const OVERLAYS = [
    { id: 'black', short: 'B' },
    { id: 'white', short: 'W' }
];

export const CARD_IDS = ['A', 'B', 'C', 'D']; // <-- 4 tarjetas post

export const toast = (msg, type = 'info') => {
    Toastify({
        text: msg,
        duration: 3000,
        gravity: "top",
        position: "center",
        style: {
            background: type === 'error' ? "#ef4444" : "#CCFF00",
            color: "#000",
            fontWeight: "700",
            borderRadius: "8px",
            boxShadow: "0 10px 30px -10px rgba(0,0,0,0.3)"
        }
    }).showToast();
};