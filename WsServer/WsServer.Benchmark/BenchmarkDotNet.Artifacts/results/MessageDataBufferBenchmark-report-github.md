```

BenchmarkDotNet v0.14.0, Windows 11 (10.0.26100.6725)
Unknown processor
.NET SDK 10.0.100-rc.1.25451.107
  [Host]     : .NET 9.0.9 (9.0.925.41916), X64 RyuJIT AVX-512F+CD+BW+DQ+VL+VBMI
  DefaultJob : .NET 9.0.9 (9.0.925.41916), X64 RyuJIT AVX-512F+CD+BW+DQ+VL+VBMI


```
| Method                  | Mean     | Error    | StdDev   | Median   |
|------------------------ |---------:|---------:|---------:|---------:|
| Unsafe_SetInt32         | 16.92 μs | 0.326 μs | 0.305 μs | 16.96 μs |
| Safe_SetInt32           | 15.18 μs | 0.250 μs | 0.234 μs | 15.21 μs |
| Safe_SetInt32_UseMemory | 21.84 μs | 0.431 μs | 0.604 μs | 21.73 μs |
| Safe_SetInt32_Marshal   | 22.19 μs | 0.425 μs | 0.332 μs | 22.21 μs |
| Unsafe_SetString        | 26.98 μs | 0.536 μs | 1.176 μs | 26.96 μs |
| Safe_SetString          | 27.67 μs | 1.763 μs | 5.197 μs | 30.54 μs |
