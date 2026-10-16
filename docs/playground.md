# Playground

по адресу https://pleiades.shalotts.site/playground/ (`apps/docs`; раньше — /landing/pleiades-orchestra/playground в репо shalotts)
Нужно создать spa playground. 
В playground будет 4 окна как тайлинги.

где iframe добавляем абсолютом select с выбором демки
https://shopping-webmcp-demo.netlify.app
https://googlechromelabs.github.io/webmcp-tools/demos/explainer/
https://googlechromelabs.github.io/webmcp-tools/demos/react-flightsearch
https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/
https://googlechromelabs.github.io/webmcp-tools/demos/ticket-booking
https://googlechromelabs.github.io/webmcp-tools/demos/hotel-chain

- самое большое окно iframe (здесь открываем тестовые демки с webmcp/mcp)
- сайд панель плеяд (виджет сразу открыт без возможности закрытия)
- нижняя панель состоит из двух окон
- - окно списка mcp тулов аккордеоном (в содержимом аккордеоно описание тула) сбоку чипса с 
    доступом (read/write - r/w)
- - окно Граф решения (только canvas граф) показываем только текущее решение выполняемое 
    пользователем в playground

чтобы виджет работал везде добавляем полифил (скачай и постав) https://github.
com/GoogleChromeLabs/webmcp-tools/blob/main/demos/shared/webmcp-polyfill.js
а для iframe allow="tools" и пробрасываем исполнение нашего виджета плеяд