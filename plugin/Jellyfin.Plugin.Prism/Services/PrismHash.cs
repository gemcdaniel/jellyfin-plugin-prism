using System.Buffers.Binary;
using System.Text;

namespace Jellyfin.Plugin.Prism.Services;

/// <summary>
/// Deterministic hashing, 3-day rotation buckets, and word-boundary matching helpers.
/// Avoids .NET's randomized HashCode.Combine so Home/Discovery rotation stays stable across restarts.
/// </summary>
public static class PrismHash
{
    private const uint FnvOffsetBasis = 2166136261u;
    private const uint FnvPrime = 16777619u;

    /// <summary>
    /// Returns a deterministic bucket index that advances once every 3 calendar days (local time).
    /// </summary>
    public static int GetRotationBucket(DateTime localNow)
    {
        return DateOnly.FromDateTime(localNow).DayNumber / 3;
    }

    /// <summary>
    /// Computes a deterministic 32-bit FNV-1a hash from a Guid and integer rotation seed.
    /// </summary>
    public static uint StableHash(Guid id, int seed)
    {
        Span<byte> buffer = stackalloc byte[20];
        id.TryWriteBytes(buffer);
        BinaryPrimitives.WriteInt32LittleEndian(buffer.Slice(16, 4), seed);
        return ComputeFnv1a(buffer);
    }

    /// <summary>
    /// Computes a deterministic 32-bit FNV-1a hash from a string and integer rotation seed.
    /// </summary>
    public static uint StableHash(string value, int seed)
    {
        var hash = FnvOffsetBasis;
        if (!string.IsNullOrEmpty(value))
        {
            var maxBytes = Encoding.UTF8.GetMaxByteCount(value.Length);
            if (maxBytes <= 512)
            {
                Span<byte> bytes = stackalloc byte[maxBytes];
                var written = Encoding.UTF8.GetBytes(value.AsSpan(), bytes);
                hash = HashBytes(hash, bytes.Slice(0, written));
            }
            else
            {
                var bytes = Encoding.UTF8.GetBytes(value);
                hash = HashBytes(hash, bytes);
            }
        }

        Span<byte> seedBytes = stackalloc byte[4];
        BinaryPrimitives.WriteInt32LittleEndian(seedBytes, seed);
        return HashBytes(hash, seedBytes);
    }

    /// <summary>
    /// Case-insensitive whole-word / whole-phrase boundary match.
    /// </summary>
    public static bool ContainsWholePhrase(string text, string phrase)
    {
        if (string.IsNullOrEmpty(text) || string.IsNullOrEmpty(phrase))
        {
            return false;
        }

        var startIndex = 0;
        while (startIndex <= text.Length - phrase.Length)
        {
            var idx = text.IndexOf(phrase, startIndex, StringComparison.OrdinalIgnoreCase);
            if (idx < 0)
            {
                return false;
            }

            var leftOk = idx == 0 || !char.IsLetterOrDigit(text[idx - 1]);
            var end = idx + phrase.Length;
            var rightOk = end == text.Length || !char.IsLetterOrDigit(text[end]);

            if (leftOk && rightOk)
            {
                return true;
            }

            startIndex = idx + 1;
        }

        return false;
    }

    private static uint ComputeFnv1a(ReadOnlySpan<byte> data)
    {
        return HashBytes(FnvOffsetBasis, data);
    }

    private static uint HashBytes(uint seed, ReadOnlySpan<byte> data)
    {
        var hash = seed;
        for (var i = 0; i < data.Length; i++)
        {
            hash ^= data[i];
            hash *= FnvPrime;
        }

        return hash;
    }
}
