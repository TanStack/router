"""Summarize paired browser blocks without treating samples as independent runs."""

import json
import math
import statistics
import sys


def departed(sample):
    direction = sample.get("direction")
    if direction is not None:
        if direction not in ["departure", "mount"]:
            raise ValueError(f"Invalid direction: {direction}")
        return direction == "departure"
    return sample["atRender"]["location"].startswith("/items/")


def summarize(data):
    rows_by_key = {}
    arms = {row["arm"] for row in data["results"]}
    workloads = {row["workload"] for row in data["results"]}
    if "baseline" not in arms or not workloads:
        raise ValueError("Expected baseline and at least one workload")
    for row in data["results"]:
        key = (row["arm"], row["workload"], row["block"])
        if key in rows_by_key:
            raise ValueError(f"Duplicate block: {key}")
        rows_by_key[key] = row
        for field in ["samples", "traceSamples"]:
            if not row[field]:
                raise ValueError(f"Empty {field}: {key}")
        for sample in row["traceSamples"]:
            task = sample.get("enclosingTask")
            if not task or not math.isfinite(task["clickToTaskEndMs"]) or task["clickToTaskEndMs"] <= 0:
                raise ValueError(f"Missing or invalid task trace: {key}/{sample['sampleId']}")
    for workload in workloads:
        baseline_blocks = {block for arm, case, block in rows_by_key if arm == "baseline" and case == workload}
        if not baseline_blocks:
            raise ValueError(f"Missing baseline blocks for {workload}")
        for arm in arms:
            blocks = {block for current_arm, case, block in rows_by_key if current_arm == arm and case == workload}
            if blocks != baseline_blocks:
                raise ValueError(f"Block IDs differ for {arm}/{workload}")
            for block in blocks:
                baseline = rows_by_key[("baseline", workload, block)]
                row = rows_by_key[(arm, workload, block)]
                for field in ["samples", "traceSamples"]:
                    def directions(samples):
                        return [sum(departed(sample) == departure for sample in samples) for departure in [False, True]] if workload == "departing" else [len(samples)]
                    counts = directions(row[field])
                    if counts != directions(baseline[field]) or any(count == 0 for count in counts):
                        raise ValueError(f"Sample counts differ for {arm}/{workload}/{block}/{field}")
    summary = {}
    for workload in sorted({row["workload"] for row in data["results"]}):
        directions = ["departure", "mount"] if workload == "departing" else ["all"]
        for direction in directions:
            name = f"{workload}:{direction}"
            means = {}
            for arm in sorted({row["arm"] for row in data["results"]}):
                rows = sorted(
                    [row for row in data["results"] if row["arm"] == arm and row["workload"] == workload],
                    key=lambda row: row["block"],
                )

                def matches(sample):
                    return workload != "departing" or departed(sample) == (direction == "departure")

                means[arm] = {
                    metric: [statistics.mean(sample[metric] for sample in row["samples"] if matches(sample)) for row in rows]
                    for metric in ["dispatchMs", "timerOpportunityMs", "renderMs"]
                }
                means[arm]["taskMs"] = [statistics.mean(sample["enclosingTask"]["clickToTaskEndMs"] for sample in row["traceSamples"] if matches(sample)) for row in rows]
            summary[name] = {}
            for arm, metrics in means.items():
                summary[name][arm] = {}
                for metric, blocks in metrics.items():
                    ratios = [math.log(value / baseline) for value, baseline in zip(blocks, means["baseline"][metric])]
                    mean_ratio = statistics.mean(ratios)
                    # Paired log ratios across alternating blocks, Student t 95% interval.
                    critical = {3: 4.302652729911275, 6: 2.570581835636305, 8: 2.364624251010299, 12: 2.200985160082949}.get(len(ratios))
                    error = critical * statistics.stdev(ratios) / math.sqrt(len(ratios)) if critical else None
                    summary[name][arm][metric] = {
                        "meanMs": statistics.mean(blocks),
                        "blockMeansMs": blocks,
                        "pairedDeltaPct": (math.exp(mean_ratio) - 1) * 100,
                        "pairedBlockDeltasPct": [(math.exp(ratio) - 1) * 100 for ratio in ratios],
                        "paired95Pct": [(math.exp(mean_ratio - error) - 1) * 100, (math.exp(mean_ratio + error) - 1) * 100] if error is not None else None,
                    }
    return summary


if __name__ == "__main__":
    with open(sys.argv[1]) as source:
        print(json.dumps(summarize(json.load(source)), indent=2))
