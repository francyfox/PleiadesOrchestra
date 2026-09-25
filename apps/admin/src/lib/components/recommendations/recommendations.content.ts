import { type Dictionary, insert, t } from "intlayer";

/** All text of the Lighthouse-style hardware audit (logic: $lib/system/audit.ts). */
const recommendationsContent = {
	key: "recommendations",
	content: {
		title: t({
			ru: "Рекомендации по производительности",
			en: "Performance recommendations",
			kk: "Өнімділік бойынша ұсыныстар",
		}),
		subtitle: t({
			ru: "Оценка железа для локального LLM (llama.cpp) и Laya (onnxruntime) относительно эталона = 100: 16 физических ядер с AVX-512 и VNNI, 64 ГБ RAM, дискретный NVIDIA GPU с 16 ГБ VRAM (CUDA для llama.cpp и onnxruntime).",
			en: "Hardware score for a local LLM (llama.cpp) plus Laya (onnxruntime) against a reference machine = 100: 16 physical cores with AVX-512 and VNNI, 64 GB RAM, a dedicated NVIDIA GPU with 16 GB VRAM (CUDA for llama.cpp and onnxruntime).",
			kk: "Жергілікті LLM (llama.cpp) мен Laya (onnxruntime) үшін жабдықтың эталонға қатысты бағасы = 100: AVX-512 және VNNI бар 16 физикалық ядро, 64 ГБ RAM, 16 ГБ VRAM бар дискретті NVIDIA GPU (llama.cpp және onnxruntime үшін CUDA).",
		}),
		overall: t({ ru: "Итог", en: "Overall", kk: "Қорытынды" }),
		categories: {
			cpu: t({ ru: "Процессор", en: "Processor", kk: "Процессор" }),
			memory: t({ ru: "Память", en: "Memory", kk: "Жад" }),
			accelerator: t({ ru: "Ускоритель", en: "Accelerator", kk: "Үдеткіш" }),
		},
		legend: {
			info: t({
				ru: "информация, не влияет на оценку",
				en: "informational, not scored",
				kk: "ақпарат, бағаға әсер етпейді",
			}),
		},
		comparison: {
			title: t({
				ru: "Эта машина против эталона",
				en: "This machine vs the reference",
				kk: "Бұл машина эталонмен салыстырғанда",
			}),
			metric: t({ ru: "Метрика", en: "Metric", kk: "Көрсеткіш" }),
			actual: t({ ru: "Эта машина", en: "This machine", kk: "Бұл машина" }),
			ideal: t({ ru: "Эталон", en: "Reference", kk: "Эталон" }),
			percent: t({
				ru: "% от эталона",
				en: "% of reference",
				kk: "эталоннан %",
			}),
			metrics: {
				cores: t({
					ru: "Физические ядра",
					en: "Physical cores",
					kk: "Физикалық ядролар",
				}),
				ram: t({ ru: "RAM", en: "RAM", kk: "RAM" }),
				vram: t({ ru: "VRAM", en: "VRAM", kk: "VRAM" }),
				gpu: t({ ru: "GPU", en: "GPU", kk: "GPU" }),
				simd: t({ ru: "SIMD", en: "SIMD", kk: "SIMD" }),
			},
			noGpu: t({ ru: "нет GPU", en: "no GPU", kk: "GPU жоқ" }),
			noAvx2: t({ ru: "нет AVX2", en: "no AVX2", kk: "AVX2 жоқ" }),
			idealGpu: t({
				ru: "дискретный NVIDIA",
				en: "dedicated NVIDIA",
				kk: "дискретті NVIDIA",
			}),
		},
		placement: {
			none: t({ ru: "нет", en: "none", kk: "жоқ" }),
			integrated: t({
				ru: "встроенный",
				en: "integrated",
				kk: "кіріктірілген",
			}),
			dedicated: t({ ru: "дискретный", en: "dedicated", kk: "дискретті" }),
		},
		checksTitle: t({
			ru: "Проверки и рекомендации",
			en: "Checks and recommendations",
			kk: "Тексерулер мен ұсыныстар",
		}),
		scoreOf: t({
			ru: insert("{{score}} / 100 от эталона"),
			en: insert("{{score}} / 100 of the reference"),
			kk: insert("эталонның {{score}} / 100"),
		}),
		audits: {
			"physical-cores": {
				title: t({
					ru: "Физические ядра CPU",
					en: "Physical CPU cores",
					kk: "CPU физикалық ядролары",
				}),
				display: t({
					ru: insert("{{actual}} из {{ideal}}"),
					en: insert("{{actual}} of {{ideal}}"),
					kk: insert("{{ideal}} ішінен {{actual}}"),
				}),
				description: t({
					ru: "Инференс на CPU (Laya в onnxruntime, llama.cpp без GPU) масштабируется по физическим ядрам. Когда модели работают одновременно, каждой нужны свои ядра: сумма их потоков не должна превышать число физических ядер.",
					en: "CPU inference (Laya in onnxruntime, llama.cpp without a GPU) scales with physical cores. When models run at the same time each needs its own cores: their thread counts must not add up to more than the physical cores.",
					kk: "CPU-дағы инференс (onnxruntime-дағы Laya, GPU-сыз llama.cpp) физикалық ядролар санымен масштабталады. Модельдер қатар жұмыс істегенде әрқайсысына өз ядролары керек: олардың ағындарының қосындысы физикалық ядролар санынан аспауы тиіс.",
				}),
			},
			simd: {
				title: t({ ru: "AVX2 и FMA", en: "AVX2 and FMA", kk: "AVX2 және FMA" }),
				description: t({
					ru: "Базовые векторные инструкции, на которые рассчитаны onnxruntime и ggml. Без них инференс на CPU медленнее в разы.",
					en: "The baseline vector instructions onnxruntime and ggml are built for. Without them CPU inference is several times slower.",
					kk: "onnxruntime мен ggml есептелген негізгі векторлық нұсқаулар. Оларсыз CPU-дағы инференс бірнеше есе баяу.",
				}),
			},
			avx512: {
				title: t({ ru: "AVX-512", en: "AVX-512", kk: "AVX-512" }),
				description: t({
					ru: "Вдвое более широкие векторы, чем у AVX2: ускоряют матричные операции в onnxruntime и ggml на CPU.",
					en: "Vectors twice as wide as AVX2: speeds up matrix operations in onnxruntime and ggml on the CPU.",
					kk: "AVX2-ден екі есе кең векторлар: CPU-дағы onnxruntime мен ggml матрицалық операцияларын жеделдетеді.",
				}),
			},
			vnni: {
				title: t({
					ru: "VNNI (аппаратный int8)",
					en: "VNNI (hardware int8)",
					kk: "VNNI (аппараттық int8)",
				}),
				description: t({
					ru: "Аппаратные int8-скалярные произведения (AVX-VNNI или AVX-512 VNNI). С ними квантованные int8-модели (например Laya в int8) заметно быстрее FP32; без них int8 считается через AVX2 и выигрыш умеренный — стоит замерить, прежде чем переходить.",
					en: "Hardware int8 dot products (AVX-VNNI or AVX-512 VNNI). With them, quantized int8 models (e.g. Laya in int8) are noticeably faster than FP32; without them int8 runs through AVX2 and the gain is moderate — measure before switching.",
					kk: "Аппараттық int8 скаляр көбейтінділері (AVX-VNNI немесе AVX-512 VNNI). Олармен квантталған int8 модельдері (мысалы, int8-дегі Laya) FP32-ден едәуір жылдам; оларсыз int8 AVX2 арқылы есептеледі және ұтыс орташа — ауыспас бұрын өлшеп алған жөн.",
				}),
			},
			"smt-threads": {
				title: t({
					ru: "Потоки инференса = физическим ядрам",
					en: "Inference threads = physical cores",
					kk: "Инференс ағындары = физикалық ядролар",
				}),
				display: t({
					ru: insert("{{physical}} (не {{logical}})"),
					en: insert("{{physical}} (not {{logical}})"),
					kk: insert("{{physical}} ({{logical}} емес)"),
				}),
				description: t({
					ru: insert(
						"SMT удваивает число логических потоков, но они делят вычислительные блоки ядра. Для onnxruntime и llama.cpp ставьте число потоков по физическим ядрам ({{physical}}), а не по логическим ({{logical}}) — лишние потоки мешают друг другу. Пример замера (apps/snake-benchmark, 6 ядер/12 потоков): Laya p50 382 мс на 6 потоках против 564 мс на 12.",
					),
					en: insert(
						"SMT doubles the logical threads, but they share each core's execution units. Set onnxruntime and llama.cpp threads to the physical cores ({{physical}}), not the logical ones ({{logical}}) — extra threads get in each other's way. Example measurement (apps/snake-benchmark, 6 cores/12 threads): Laya p50 382 ms on 6 threads vs 564 ms on 12.",
					),
					kk: insert(
						"SMT логикалық ағындар санын екі еселейді, бірақ олар ядроның есептеу блоктарын бөліседі. onnxruntime мен llama.cpp үшін ағындар санын логикалық ({{logical}}) емес, физикалық ядролар ({{physical}}) бойынша қойыңыз — артық ағындар бір-біріне кедергі келтіреді. Өлшеу мысалы (apps/snake-benchmark, 6 ядро/12 ағын): Laya p50 6 ағында 382 мс, 12 ағында 564 мс.",
					),
				}),
			},
			"cpu-load": {
				title: t({
					ru: "Текущая загрузка CPU",
					en: "Current CPU load",
					kk: "CPU ағымдағы жүктемесі",
				}),
				display: t({
					ru: insert("{{percent}}%"),
					en: insert("{{percent}}%"),
					kk: insert("{{percent}}%"),
				}),
				description: {
					busy: t({
						ru: "CPU почти полностью занят: задержки моделей сейчас выше обычных, а замеры производительности будут искажены.",
						en: "The CPU is almost fully busy: model latency is higher than usual right now and performance measurements will be skewed.",
						kk: "CPU толығымен дерлік бос емес: қазір модельдердің кідірісі әдеттегіден жоғары, ал өнімділік өлшемдері бұрмаланады.",
					}),
					normal: t({
						ru: "Нагрузка в норме — замеры производительности сейчас репрезентативны.",
						en: "The load is normal — performance measurements are representative right now.",
						kk: "Жүктеме қалыпты — өнімділік өлшемдері қазір репрезентативті.",
					}),
				},
			},
			"ram-total": {
				title: t({
					ru: "Объём оперативной памяти",
					en: "Total RAM",
					kk: "Жедел жад көлемі",
				}),
				display: t({
					ru: insert("{{actual}} из {{ideal}}"),
					en: insert("{{actual}} of {{ideal}}"),
					kk: insert("{{ideal}} ішінен {{actual}}"),
				}),
				description: t({
					ru: "Модели держатся в RAM целиком (а при встроенном GPU — и видеопамять тоже в RAM). Запас памяти позволяет брать модели крупнее и не уходить в своп.",
					en: "Models are held in RAM entirely (and with an integrated GPU, video memory lives in RAM too). Headroom allows larger models without swapping.",
					kk: "Модельдер жедел жадта толығымен сақталады (кіріктірілген GPU кезінде бейне жады да RAM-да). Жад қоры үлкенірек модельдерді свопсыз пайдалануға мүмкіндік береді.",
				}),
			},
			"ram-available": {
				title: t({
					ru: "Свободная память сейчас",
					en: "Free memory right now",
					kk: "Қазіргі бос жад",
				}),
				description: {
					low: t({
						ru: "Свободной памяти мало: при загрузке ещё одной модели или росте контекста система начнёт свопиться, и задержки взлетят.",
						en: "Free memory is low: loading another model or a growing context will make the system swap, and latency will spike.",
						kk: "Бос жад аз: тағы бір модельді жүктегенде немесе контекст өскенде жүйе свопқа кетеді, кідіріс күрт өседі.",
					}),
					ok: t({
						ru: "Свободной памяти достаточно для текущих моделей.",
						en: "There is enough free memory for the current models.",
						kk: "Ағымдағы модельдерге бос жад жеткілікті.",
					}),
				},
			},
			"uma-bandwidth": {
				title: t({
					ru: "UMA: GPU делит оперативную память",
					en: "UMA: the GPU shares system RAM",
					kk: "UMA: GPU жедел жадты ортақ пайдаланады",
				}),
				display: t({
					ru: insert("VRAM {{vram}} + GTT {{gtt}}"),
					en: insert("VRAM {{vram}} + GTT {{gtt}}"),
					kk: insert("VRAM {{vram}} + GTT {{gtt}}"),
				}),
				description: t({
					ru: "Встроенный GPU работает из общей RAM: под VRAM выделено немного, остальное модель берёт через GTT. Генерация токенов упирается в пропускную способность памяти, общую для CPU и GPU, — важен двухканальный (или больше) режим RAM с высокой частотой. Увеличение UMA Frame Buffer в BIOS обычно не ускоряет llama.cpp: GTT и так доступен, а у системы отнимается RAM.",
					en: "An integrated GPU works out of shared RAM: little is reserved as VRAM, the model takes the rest through GTT. Token generation is bound by memory bandwidth shared between CPU and GPU — dual-channel (or more) high-frequency RAM matters. Raising the UMA Frame Buffer in the BIOS usually doesn't speed up llama.cpp: GTT is available anyway, and the system loses RAM.",
					kk: "Кіріктірілген GPU ортақ RAM-нан жұмыс істейді: VRAM-ға аз бөлінген, қалғанын модель GTT арқылы алады. Токен генерациясы CPU мен GPU-ға ортақ жад өткізу қабілетіне тіреледі — жоғары жиілікті екі арналы (немесе одан көп) RAM маңызды. BIOS-та UMA Frame Buffer-ді ұлғайту әдетте llama.cpp-ны жеделдетпейді: GTT онсыз да қолжетімді, ал жүйе RAM-нан айырылады.",
				}),
			},
			accelerator: {
				title: t({
					ru: "Ускоритель для текстовой модели",
					en: "Accelerator for the text model",
					kk: "Мәтіндік модельге арналған үдеткіш",
				}),
				display: {
					none: t({ ru: "нет GPU", en: "no GPU", kk: "GPU жоқ" }),
					integrated: t({
						ru: insert("встроенный {{vendor}} (UMA)"),
						en: insert("integrated {{vendor}} (UMA)"),
						kk: insert("кіріктірілген {{vendor}} (UMA)"),
					}),
					dedicated: t({
						ru: insert("дискретный {{vendor}}"),
						en: insert("dedicated {{vendor}}"),
						kk: insert("дискретті {{vendor}}"),
					}),
				},
				description: t({
					ru: "Генерация текста на GPU освобождает ядра CPU для Laya и обычно быстрее. Дискретный GPU с собственной памятью лучше встроенного: у встроенного пропускная способность памяти общая с CPU.",
					en: "Generating text on the GPU frees CPU cores for Laya and is usually faster. A dedicated GPU with its own memory beats an integrated one, which shares memory bandwidth with the CPU.",
					kk: "Мәтінді GPU-да генерациялау CPU ядроларын Laya үшін босатады және әдетте жылдамырақ. Өз жады бар дискретті GPU кіріктірілгеннен жақсы: кіріктірілгеннің жад өткізу қабілеті CPU-мен ортақ.",
				}),
			},
			vram: {
				title: t({ ru: "Видеопамять", en: "Video memory", kk: "Бейне жады" }),
				display: {
					none: t({ ru: "—", en: "—", kk: "—" }),
					integrated: t({
						ru: insert("общая с RAM (GTT {{gtt}})"),
						en: insert("shared with RAM (GTT {{gtt}})"),
						kk: insert("RAM-мен ортақ (GTT {{gtt}})"),
					}),
					dedicated: t({
						ru: insert("{{vram}} из {{ideal}}"),
						en: insert("{{vram}} of {{ideal}}"),
						kk: insert("{{ideal}} ішінен {{vram}}"),
					}),
				},
				description: t({
					ru: "Собственная VRAM определяет, какая модель поместится на GPU целиком и с каким контекстом. Общая с RAM память (UMA) формально большая, но медленная — поэтому засчитывается частично.",
					en: "Dedicated VRAM decides which model fits on the GPU entirely and with what context. Memory shared with RAM (UMA) is nominally large but slow, so it only counts partially.",
					kk: "Меншікті VRAM қандай модель GPU-ға толық және қандай контекстпен сыятынын анықтайды. RAM-мен ортақ жад (UMA) формалды түрде үлкен, бірақ баяу — сондықтан ішінара ғана есептеледі.",
				}),
			},
			"laya-gpu": {
				title: t({
					ru: "Laya на GPU (onnxruntime)",
					en: "Laya on the GPU (onnxruntime)",
					kk: "GPU-дағы Laya (onnxruntime)",
				}),
				display: {
					cuda: t({ ru: "CUDA", en: "CUDA", kk: "CUDA" }),
					cpu: t({ ru: "только CPU", en: "CPU only", kk: "тек CPU" }),
				},
				description: t({
					ru: "onnxruntime на Linux ускоряется на GPU только через CUDA/TensorRT (NVIDIA); DirectML есть лишь в Windows. На AMD и Intel Laya остаётся на CPU — тогда ей нужны свободные физические ядра.",
					en: "On Linux onnxruntime only runs on the GPU through CUDA/TensorRT (NVIDIA); DirectML exists only on Windows. On AMD and Intel, Laya stays on the CPU — and then needs free physical cores.",
					kk: "Linux-та onnxruntime GPU-да тек CUDA/TensorRT (NVIDIA) арқылы жеделдетіледі; DirectML тек Windows-та бар. AMD мен Intel-де Laya CPU-да қалады — онда оған бос физикалық ядролар керек.",
				}),
			},
			"gpu-backend": {
				title: t({
					ru: "Рекомендуемый бэкенд llama.cpp",
					en: "Recommended llama.cpp backend",
					kk: "Ұсынылатын llama.cpp бэкенді",
				}),
				display: {
					none: t({ ru: "CPU", en: "CPU", kk: "CPU" }),
					nvidia: t({ ru: "CUDA", en: "CUDA", kk: "CUDA" }),
					amdDedicated: t({
						ru: "Vulkan или ROCm",
						en: "Vulkan or ROCm",
						kk: "Vulkan немесе ROCm",
					}),
					integrated: t({ ru: "Vulkan", en: "Vulkan", kk: "Vulkan" }),
				},
				description: {
					none: t({
						ru: "GPU нет: обе модели делят CPU. Разделите физические ядра между llama.cpp и Laya (сумма потоков ≤ числу ядер) или сериализуйте вызовы моделей.",
						en: "No GPU: both models share the CPU. Split the physical cores between llama.cpp and Laya (sum of threads ≤ cores) or serialize model calls.",
						kk: "GPU жоқ: екі модель де CPU-ды бөліседі. Физикалық ядроларды llama.cpp пен Laya арасында бөліңіз (ағындар қосындысы ≤ ядролар) немесе модель шақыруларын кезекке қойыңыз.",
					}),
					nvidia: t({
						ru: "Сборка llama.cpp с CUDA (образ ghcr.io/ggml-org/llama.cpp:server-cuda) и N_GPU_LAYERS=99; Laya тоже может уйти на GPU через onnxruntime CUDA EP.",
						en: "A CUDA build of llama.cpp (image ghcr.io/ggml-org/llama.cpp:server-cuda) with N_GPU_LAYERS=99; Laya can move to the GPU too via onnxruntime's CUDA EP.",
						kk: "CUDA бар llama.cpp жинағы (ghcr.io/ggml-org/llama.cpp:server-cuda образы) және N_GPU_LAYERS=99; Laya да onnxruntime CUDA EP арқылы GPU-ға көше алады.",
					}),
					amdDedicated: t({
						ru: "Для дискретных Radeon подходят оба: ROCm (официально поддерживаемые карты) или Vulkan (образ server-vulkan, работает на любом Radeon через Mesa RADV). N_GPU_LAYERS=99.",
						en: "Both work for dedicated Radeons: ROCm (officially supported cards) or Vulkan (the server-vulkan image, runs on any Radeon via Mesa RADV). N_GPU_LAYERS=99.",
						kk: "Дискретті Radeon үшін екеуі де жарайды: ROCm (ресми қолдау көрсетілетін карталар) немесе Vulkan (server-vulkan образы, Mesa RADV арқылы кез келген Radeon-да жұмыс істейді). N_GPU_LAYERS=99.",
					}),
					integrated: t({
						ru: "Vulkan (образ ghcr.io/ggml-org/llama.cpp:server-vulkan, Mesa-драйвер) с N_GPU_LAYERS=99 и пробросом /dev/dri в контейнер.",
						en: "Vulkan (image ghcr.io/ggml-org/llama.cpp:server-vulkan, Mesa driver) with N_GPU_LAYERS=99 and /dev/dri passed into the container.",
						kk: "Vulkan (ghcr.io/ggml-org/llama.cpp:server-vulkan образы, Mesa драйвері), N_GPU_LAYERS=99 және /dev/dri контейнерге жіберілген.",
					}),
				},
				rocmNote: t({
					ru: "ROCm встроенные Radeon официально не поддерживает — обход через HSA_OVERRIDE_GFX_VERSION нестабилен.",
					en: "ROCm doesn't officially support integrated Radeons — the HSA_OVERRIDE_GFX_VERSION workaround is unstable.",
					kk: "ROCm кіріктірілген Radeon-ды ресми түрде қолдамайды — HSA_OVERRIDE_GFX_VERSION арқылы айналып өту тұрақсыз.",
				}),
			},
		},
	},
} satisfies Dictionary;

export default recommendationsContent;
