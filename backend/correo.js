// Envio de correos con nodemailer (datos SMTP en el archivo .env).
require('dotenv').config();
const nodemailer = require('nodemailer');

// El transporte se crea una sola vez y se reutiliza.
let transporte;

function smtpConfigurado() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function obtenerTransporte() {
    if (!transporte) {
        const puerto = Number(process.env.SMTP_PORT) || 587;
        transporte = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: puerto,
            secure: puerto === 465, // 465 = SSL directo; 587 = STARTTLS
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
    }
    return transporte;
}

// Evita que un nombre con caracteres raros rompa el HTML del correo.
function escaparHtml(texto) {
    return String(texto).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

// Manda el codigo de recuperacion de contrasena.
async function enviarCodigoRecuperacion(destinatario, nombre, codigo, minutosVigencia) {
    // Sin SMTP configurado (solo en desarrollo) el codigo se muestra en la consola para poder probar.
    if (!smtpConfigurado()) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('No hay servidor de correo (SMTP) configurado en el .env');
        }
        console.warn(`[DESARROLLO] SMTP sin configurar. Código para ${destinatario}: ${codigo}`);
        return;
    }

    const nombreSeguro = escaparHtml(nombre || 'usuario');

    await obtenerTransporte().sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: destinatario,
        subject: 'Código para recuperar tu contraseña - Servicio Social TecNM Culiacán',
        text:
            `Hola ${nombre || 'usuario'}:\n\n` +
            `Tu código para recuperar tu contraseña es: ${codigo}\n\n` +
            `El código vence en ${minutosVigencia} minutos y solo se puede usar una vez.\n` +
            `Si tú no lo solicitaste, ignora este correo; tu contraseña no cambiará.\n\n` +
            `Sistema de Gestión del Servicio Social - TecNM Campus Culiacán`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; color: #222;">
                <h2 style="color: #1b396a;">Recuperación de contraseña</h2>
                <p>Hola <strong>${nombreSeguro}</strong>:</p>
                <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta del Sistema de Servicio Social.
                   Escribe este código en la página para continuar:</p>
                <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center;
                          background: #f2f4f8; padding: 16px; border-radius: 8px;">${codigo}</p>
                <p>El código vence en <strong>${minutosVigencia} minutos</strong> y solo se puede usar una vez.</p>
                <p style="color: #666; font-size: 13px;">Si tú no solicitaste este cambio, ignora este correo; tu contraseña no cambiará.</p>
                <hr style="border: none; border-top: 1px solid #ddd;">
                <p style="color: #999; font-size: 12px;">Sistema de Gestión del Servicio Social — TecNM Campus Culiacán</p>
            </div>`
    });
}

module.exports = { enviarCodigoRecuperacion, smtpConfigurado };
