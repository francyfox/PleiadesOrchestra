// A flat C API over CTranslate2 + SentencePiece, so Bun can call it through
// `bun:ffi` (CTranslate2 itself has only a C++ and a Python API). One handle =
// one loaded Opus-MT model; `tr_translate` is a plain function over strings.
//
// Build: see native/build.sh. Tokenizing follows the Marian/Opus-MT recipe of
// the CTranslate2 docs: SentencePiece pieces of the source plus `</s>` in,
// SentencePiece pieces of the target out.

#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include <ctranslate2/translator.h>
#include <sentencepiece_processor.h>

namespace {

struct Handle {
  std::unique_ptr<ctranslate2::Translator> translator;
  sentencepiece::SentencePieceProcessor source;
  sentencepiece::SentencePieceProcessor target;
};

void put_error(char* error, int capacity, const std::string& message) {
  if (!error || capacity <= 0) return;
  std::strncpy(error, message.c_str(), static_cast<size_t>(capacity) - 1);
  error[capacity - 1] = '\0';
}

}  // namespace

extern "C" {

// Loads the model; NULL on failure, with the reason in `error`.
void* tr_create(const char* model_dir, const char* source_spm,
                const char* target_spm, int intra_threads,
                const char* compute_type, char* error, int error_capacity) {
  try {
    auto handle = std::make_unique<Handle>();
    auto status = handle->source.Load(source_spm);
    if (!status.ok()) {
      put_error(error, error_capacity, "source.spm: " + status.ToString());
      return nullptr;
    }
    status = handle->target.Load(target_spm);
    if (!status.ok()) {
      put_error(error, error_capacity, "target.spm: " + status.ToString());
      return nullptr;
    }
    ctranslate2::ReplicaPoolConfig pool;
    pool.num_threads_per_replica = intra_threads > 0 ? intra_threads : 4;
    handle->translator = std::make_unique<ctranslate2::Translator>(
        model_dir, ctranslate2::Device::CPU,
        ctranslate2::str_to_compute_type(compute_type ? compute_type : "int8"),
        std::vector<int>{0}, /*tensor_parallel=*/false, pool);
    return handle.release();
  } catch (const std::exception& e) {
    put_error(error, error_capacity, e.what());
    return nullptr;
  }
}

// Translates one UTF-8 text into `out` (NUL-terminated). Returns the number of
// bytes written (without the NUL), -1 on an error (message in `out`), or
// -(needed + 2) when `out` is too small (so the caller can retry bigger).
int tr_translate(void* raw, const char* text, int beam_size, int max_length,
                 char* out, int out_capacity) {
  auto* handle = static_cast<Handle*>(raw);
  try {
    std::vector<std::string> pieces;
    handle->source.Encode(text, &pieces);
    pieces.emplace_back("</s>");

    ctranslate2::TranslationOptions options;
    options.beam_size = static_cast<size_t>(beam_size > 0 ? beam_size : 2);
    options.max_decoding_length =
        static_cast<size_t>(max_length > 0 ? max_length : 64);
    options.return_scores = false;

    auto results = handle->translator->translate_batch({pieces}, options);
    std::string decoded;
    if (!results.empty() && !results[0].hypotheses.empty()) {
      handle->target.Decode(results[0].hypotheses[0], &decoded);
    }
    if (static_cast<int>(decoded.size()) + 1 > out_capacity) {
      return -(static_cast<int>(decoded.size()) + 2);
    }
    std::memcpy(out, decoded.data(), decoded.size());
    out[decoded.size()] = '\0';
    return static_cast<int>(decoded.size());
  } catch (const std::exception& e) {
    put_error(out, out_capacity, e.what());
    return -1;
  }
}

void tr_free(void* raw) { delete static_cast<Handle*>(raw); }

}  // extern "C"
