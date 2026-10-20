import { type Dictionary, t } from "intlayer";

/** Texts of Sentry's feedback widget (its option names). */
const feedbackWidgetContent = {
	key: "feedback-widget",
	content: {
		triggerLabel: t({ ru: "Отзыв", en: "Feedback", kk: "Пікір" }),
		triggerAriaLabel: t({
			ru: "Сообщить о проблеме",
			en: "Report a problem",
			kk: "Мәселе туралы хабарлау",
		}),
		formTitle: t({
			ru: "Сообщить о проблеме",
			en: "Report a problem",
			kk: "Мәселе туралы хабарлау",
		}),
		nameLabel: t({ ru: "Имя", en: "Name", kk: "Аты" }),
		namePlaceholder: t({ ru: "Ваше имя", en: "Your name", kk: "Атыңыз" }),
		emailLabel: t({ ru: "Почта", en: "Email", kk: "Пошта" }),
		emailPlaceholder: t({
			ru: "you@example.com",
			en: "you@example.com",
			kk: "you@example.com",
		}),
		messageLabel: t({ ru: "Описание", en: "Description", kk: "Сипаттама" }),
		messagePlaceholder: t({
			ru: "Что случилось и что вы ожидали?",
			en: "What happened, and what did you expect?",
			kk: "Не болды және не күттіңіз?",
		}),
		isRequiredLabel: t({
			ru: "(обязательно)",
			en: "(required)",
			kk: "(міндетті)",
		}),
		submitButtonLabel: t({ ru: "Отправить", en: "Send", kk: "Жіберу" }),
		cancelButtonLabel: t({ ru: "Отмена", en: "Cancel", kk: "Болдырмау" }),
		confirmButtonLabel: t({ ru: "Готово", en: "Done", kk: "Дайын" }),
		successMessageText: t({
			ru: "Спасибо! Отзыв отправлен.",
			en: "Thank you! Your feedback was sent.",
			kk: "Рахмет! Пікір жіберілді.",
		}),
		addScreenshotButtonLabel: t({
			ru: "Добавить скриншот",
			en: "Add a screenshot",
			kk: "Скриншот қосу",
		}),
		removeScreenshotButtonLabel: t({
			ru: "Убрать скриншот",
			en: "Remove the screenshot",
			kk: "Скриншотты алып тастау",
		}),
		highlightToolText: t({ ru: "Выделить", en: "Highlight", kk: "Белгілеу" }),
		hideToolText: t({ ru: "Скрыть", en: "Hide", kk: "Жасыру" }),
		removeHighlightText: t({ ru: "Убрать", en: "Remove", kk: "Алып тастау" }),
		errorEmptyMessageText: t({
			ru: "Опишите проблему.",
			en: "Please describe the problem.",
			kk: "Мәселені сипаттаңыз.",
		}),
		errorNoClientText: t({
			ru: "Отправка отзывов сейчас недоступна.",
			en: "Feedback can't be sent right now.",
			kk: "Пікір жіберу қазір қолжетімсіз.",
		}),
		errorTimeoutText: t({
			ru: "Не удалось отправить: превышено время ожидания.",
			en: "Couldn't send: the request timed out.",
			kk: "Жіберілмеді: күту уақыты асып кетті.",
		}),
		errorForbiddenText: t({
			ru: "Отправка отзывов с этого адреса запрещена.",
			en: "Feedback from this address is not allowed.",
			kk: "Бұл мекенжайдан пікір жіберуге тыйым салынған.",
		}),
		errorGenericText: t({
			ru: "Не удалось отправить отзыв. Попробуйте позже.",
			en: "Couldn't send the feedback. Please try again later.",
			kk: "Пікір жіберілмеді. Кейінірек қайталаңыз.",
		}),
	},
} satisfies Dictionary;

export default feedbackWidgetContent;
