```

BenchmarkDotNet v0.14.0, Windows 11 (10.0.26100.6725)
Unknown processor
.NET SDK 10.0.100-rc.1.25451.107
  [Host]     : .NET 9.0.9 (9.0.925.41916), X64 RyuJIT AVX-512F+CD+BW+DQ+VL+VBMI
  DefaultJob : .NET 9.0.9 (9.0.925.41916), X64 RyuJIT AVX-512F+CD+BW+DQ+VL+VBMI


```
| Method                         | Mean          | Error        | StdDev        | Median        |
|------------------------------- |--------------:|-------------:|--------------:|--------------:|
| Serialize_Single_MessagePack   |     126.32 ns |     2.440 ns |      6.428 ns |     124.93 ns |
| Serialize_Single_MemoryPack    |      77.69 ns |     1.608 ns |      1.914 ns |      77.46 ns |
| Serialize_Single_Json          |     783.30 ns |    25.011 ns |     73.747 ns |     781.02 ns |
| Serialize_Single_CustomUnsafe  |     165.41 ns |    10.273 ns |     30.130 ns |     154.60 ns |
| Serialize_Single_CustomSafe    |     197.20 ns |     5.622 ns |     16.577 ns |     196.66 ns |
| Serialize_Batch_MessagePack    |  10,205.49 ns |   201.286 ns |    474.455 ns |  10,260.28 ns |
| Serialize_Batch_MemoryPack     |   3,321.64 ns |    65.640 ns |    146.813 ns |   3,305.87 ns |
| Serialize_Batch_Json           |  56,577.54 ns | 1,092.490 ns |  1,168.952 ns |  56,725.78 ns |
| Deserialize_Single_MessagePack |     160.38 ns |     3.219 ns |      6.720 ns |     159.87 ns |
| Deserialize_Single_MemoryPack  |      72.36 ns |     1.491 ns |      2.232 ns |      72.40 ns |
| Deserialize_Single_Json        |     973.92 ns |    19.481 ns |     37.995 ns |     972.26 ns |
| MemoryAllocation_MessagePack   | 277,875.89 ns | 5,553.636 ns | 10,831.942 ns | 277,667.50 ns |
| MemoryAllocation_MemoryPack    | 158,099.32 ns | 3,135.106 ns |  7,203.427 ns | 156,583.86 ns |
| MemoryAllocation_CustomUnsafe  | 155,315.40 ns | 4,724.574 ns | 13,930.513 ns | 154,373.32 ns |
