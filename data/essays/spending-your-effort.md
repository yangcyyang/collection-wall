我们最新的 Claude 模型有一个特别好的地方：它们会响应 effort，而且在 Claude Code 里切换 effort 不会打断 prompt cache。即便如此，用户还是问了我很多。effort 到底是什么？什么时候该用哪一档？我们为什么需要 effort？

为了回答这些，我决定把 evals 深挖一遍，再用日常工作自己测一遍不同档位的 effort。

*说明：这篇文章的交互图表和讲解，也可以看 [claude.dev 上的互动版](https://claude.dev/blog/spending-your-effort/)。*

从大面上说，我发现 effort 很适合调节 Claude 做多少验证、多少边界情况测试，以及它自己用多少判断。

多花 effort，在验证和边界测试更有用的地方结果更好，比如硬件、代码审查和安全。

但 low 和 medium effort 很适合把事情尽快做完，同时让你留在和 Claude 的回路里。

做普通软件工程时，我现在跑的是这样一个循环：先让模型来访谈我，再用 low 或 medium effort 实现，然后我看它做出来的东西，最后用 high effort 做验证。

# effort 是什么？

从高处看，effort 给模型一个近似值：你希望它在这道任务上花多少算力。它和你对任务难度的判断有些关系。

可以这样想。如果有人让你连续干 12 小时做一件事，你可能会以为他们就是要你把它做完，并且非常用力。如果同样的任务只给你 1 小时，你会尽量交出一个能满足任务的最好版本，然后预期后面再迭代。

或者，你可能会顶回去，说这事*至少*要 3 小时，然后真的花 3 小时交出来。

effort 也该这么理解。Claude 总会把你的任务做得还算合理，但更高的 effort 会让 Claude 自己多做判断和验证。

# effort 曲线

Fable 5.1 和 Opus 5.5 的 effort 曲线是我们目前最好的：每一档上去，基准分数和消耗的 token 都会抬一截。下面这张图是 Terminal Bench 3.0 按 effort 分档的分数，数据来自我为这篇文章跑的 evals。

> 图见原文。

但这在实际里意味着什么？为了看清楚，我在不同 effort 档位上试了几件任务，也把基准翻了一遍。

# 带着 effort 做东西

理解模型怎么工作，最好的办法是做实验。我在 Opus 5.5 上用不同 effort 档位做同一批任务，看它会做哪些工作。我试过很多种工作，这里只用几个小例子来说明。

## 说得很含糊的构建任务

如果我让 Claude「做一个个人健身和锻炼记录应用」，effort 会大幅改变应用做得多完整，也会让 Claude 沿途自己做更多选择。low effort 时，健身应用只是一个记录和一张简单图。档位更高，应用更复杂、细节更多。max effort 时会出现热力图。

> 图见原文。

如果我想要一个简单底座再往下迭代，low effort 就能做完。max effort 适合我希望 Claude 一次就交出它最好的那一版。

## 规格不多的设计任务

如果任务已经大体说清了，但我还想和 Claude 一起探索呢？举例：我让它重做 Claude Code 里的 /config 菜单。每一轮的想法大体一样，都是用子菜单，搜索也更好。

low effort（大约 1 分钟）给我一张交互草图，能传达想法，但看起来不太像 Claude Code。

max effort（大约 28 分钟）给我一份看起来很像 Claude Code 的样稿，外加好几条不同流程的走查。

如果我的目标是迭代、给反馈，low effort 会快得多。但 max effort 一上来就更完整。对这件具体任务，我更想用 low effort 先看懂 Claude 的设想。

> 图见原文。

## 规格很细的构建任务

如果我给 Claude 很多细节呢？我试过让 Claude 就这个健身应用深入访谈我，再把那份规格交给不同模型、不同 effort 去实现。

我发现，有了这份规格之后，模型的行为接近得多。我拿到的设计和实现都相当像，只是细节不同。max effort 时，Claude 会花时间把其中一些细节简化掉。

> 图见原文。

## 小结

做常规软件工程，尤其是新功能，effort 档位很大程度取决于我想在回路里待多深。low effort 让 Claude 很快给出一个起点。更高的 effort 会做完更多工作，但 Claude 也会替我做更多假设。

功能开发上，我用过一条特别有效的循环：

- 给 Claude 一份规格，让它就我漏掉的细节来访谈我
- 用 low effort 实现
- 检查它有没有抓住要领，需要的话继续用 low effort 迭代
- 用 high effort 做验证和测试

# effort 档位怎样影响难题上的产出

上面显然是小例子，Claude 完全做得完。如果差别在于「做不做得完」呢？

要找这种难题，得去基准里。我钻进一个我喜欢的：Terminal Bench 3，一个由社区出题的基准。

Terminal-Bench 3.0 的题目大致可以分成安全、硬件、机器学习、科学、软件、运维和媒体。全部题目在这里：[Terminal-Bench v3.0.0](https://github.com/harbor-framework/terminal-bench/releases/tag/v3.0.0)。题目来自社区，谁都可以贡献。

值得读一读，好知道这些模型面对的是什么题。很多任务的范围和野心让我吃惊。它们比我日常碰到的平均任务复杂得多。

例如有这些任务：

- **Hardware（retro-console-soc）**：用 Verilog 做一台 8 位游戏机，塞进一块小 FPGA，并能渲染测试 ROM。
- **Science（takens-embedding-lean）**：在 Lean 4 里形式化证明 Takens 嵌入定理。
- **ML（mp-checkpoint-consolidation）**：把混合专家模型 checkpoint 的 16 个分片合成一个文件，并复现参考 logits。
- **Operations（intrastat-meldung）**：把一家公司月底的欧盟贸易统计申报从头到尾跑完。
- **Media（layout-config-recreation）**：把一张海报图重做成可编辑的版式文件。

## 边界情况很多时，更高的 effort 有帮助

我读 Terminal Bench 3 结果后的主要结论是：**更高的 effort，最适合藏着很多边界情况的任务。**

一个干净的例子是 html-js-filter。这是 Terminal-Bench 3.0 里的一道题，要求做一个 HTML 消毒器，把每一种把 JavaScript 偷运进页面的办法都剥掉。Fable 5.1 从 low 的 1/5，升到 xhigh 的 5/5。

low effort 的一次典型尝试大约 2 分钟。这些尝试大致一遍就写好过滤器，然后只拿一张手写页面去测。

high effort 一次大约 33 分钟跑完。在我追踪的那次运行里，它先对抗式地复查第一稿，再去读已安装解析器的源码找 bug，跑很多干净测试直到输出和输入一致，跑一套标准 XSS 测试，最后写了一个随机文档 fuzzer。

对 HTML 消毒器这种边界情况极多的东西，这笔额外 effort 很值。对生产要求高的复杂任务，比如性能优化或安全审查，多花 token 换彻底，也说得通。

但不是每件事都需要这一档。

下面这张图给出每一道 Terminal-Bench 3.0 的结果，以及它是怎么失败的，横跨不同模型和 effort 档位。总体上，提高 effort 往往会减少「漏掉边界情况」导致的失败（紫色块），但修不好「路子本身就错了」（蓝色块）。

> 图见原文。

## 哪些问题领域会从 effort 里受益

我在 TerminalBench 上评这些模型时，最有意思的一点是：有些问题领域从 effort 里得到的好处，比别的领域大。下面这张图有分解。

> 图见原文。

为了说明，我从 Terminal Bench 3.0 的不同领域挑了几道题。Opus 5.5 在 low effort 失败、在 high effort 成功，多半是因为它做了测试，并把边界情况算进去了。

**mvcc-lsm-compaction**：这是 Terminal-Bench 3.0 的一道题，要求根据崩溃报告修一个存储引擎的 bug，同时不能弄坏 compaction。Opus 5.5 从 low 的 0/5，升到 xhigh 的 4/5。

low（每次大约一分钟）时，Claude 会在编译或跑复现程序之前就改代码，也不检查新测试能不能抓住原来的 bug。

xhigh（大约 11 分钟）时，Claude 先复现崩溃，再对着一个从不做 compaction 的参考实现写随机测试，并检查：修到一半时，测试应该失败。

**cli-2ph-simple**：这是 Terminal-Bench 3.0 的一道题，要求用 Python 写一个命令行线性规划求解器。Opus 5.5 从 low 的 0/5，升到 high 的 5/5。

low 的尝试一遍写完求解器，用几个小问题检查一下，大约 1 万 token 就停了。最后一条消息里，Claude 提醒说大问题可能很慢，但没有去查。

high 的尝试里，Claude 用另一个暴力求解器，在随机问题上测自己的求解器，再给更大的问题计时。它撞上跑得太久或直接崩溃的情况，然后回头改搜索。

**gsea-proteomics**：这是 Terminal-Bench 3.0 的一道题，要求对蛋白质组数据做基因集富集分析（GSEA），找出八种处理里哪些像目标组织。Opus 5.5 从 low 的 0/5，升到 high 的 4/5。

low effort 时，Claude 选了一种听起来合理的数据预处理，只按那一种方式跑分析，然后报告结果。

high 时，Claude 试了两种预处理。它注意到「哪些处理算显著」这份名单变了，先挖原因，再选对的那一种。

如果用户在回路里，Claude 也许会问用户该怎么设定问题。没有用户在回路里时，high effort 做得更好。

## 在 Claude Code 里什么时候用哪一档

我什么时候用哪一档，经验是这样：

- **Low**：我想要快，并且人留在回路里。比如头脑风暴、画草图、做简单改动。
- **Medium**：我大部分常规软件工程。比如实现新功能。
- **High**：验证很重要，或者有边界情况。比如在已有代码库里修 bug。
- **Max**：我希望 Claude 完全自己把难题做完。比如把一个应用从头做到验证完，或者在关键软件里找安全漏洞。

> 图见原文。

按你的任务，甚至在对话中途，用 Claude Code 里的 /effort 给 Opus 5.5 和 Fable 5.1 换档试试，然后告诉我这跟你的直觉一不一样。
