const { expect } = require("chai");
const { ethers } = require("hardhat");

const DAY = 86400;

describe("AgentLounge", function () {
  let registry, lounge;
  let holder, holder2, outsider;

  beforeEach(async function () {
    [holder, holder2, outsider] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockAgentID");
    registry = await Mock.deploy();
    await registry.setHolder(holder.address, true);
    await registry.setHolder(holder2.address, true);
    // `outsider` deliberately NOT marked as a holder.

    const Lounge = await ethers.getContractFactory("AgentLounge");
    lounge = await Lounge.deploy(await registry.getAddress());
  });

  // Move chain time to the start of the next UTC day (plus a second).
  async function advanceOneDay() {
    const block = await ethers.provider.getBlock("latest");
    const intoNextDay = DAY - (block.timestamp % DAY) + 1;
    await ethers.provider.send("evm_increaseTime", [intoNextDay]);
    await ethers.provider.send("evm_mine", []);
  }

  async function checkInOnConsecutiveDays(who, days) {
    for (let i = 0; i < days; i++) {
      if (i > 0) await advanceOneDay();
      await lounge.connect(who).checkIn();
    }
  }

  describe("Agent ID gate", function () {
    it("rejects a zero registry address in the constructor", async function () {
      const Lounge = await ethers.getContractFactory("AgentLounge");
      await expect(
        Lounge.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("Registry required");
    });

    it("non-holder cannot check in", async function () {
      await expect(lounge.connect(outsider).checkIn()).to.be.revertedWith(
        "Agent ID required"
      );
    });

    it("non-holder cannot post a message", async function () {
      await expect(
        lounge.connect(outsider).postMessage("hello")
      ).to.be.revertedWith("Agent ID required");
    });

    it("non-holder cannot claim a badge", async function () {
      await expect(lounge.connect(outsider).claimBadge()).to.be.revertedWith(
        "Agent ID required"
      );
    });

    it("losing holder status revokes write access", async function () {
      await registry.setHolder(holder.address, false);
      await expect(lounge.connect(holder).checkIn()).to.be.revertedWith(
        "Agent ID required"
      );
    });
  });

  describe("check-in", function () {
    it("holder can check in and stats are recorded", async function () {
      const today = await currentDay();

      await expect(lounge.connect(holder).checkIn())
        .to.emit(lounge, "CheckedIn")
        .withArgs(holder.address, today, 1, 11);

      const s = await lounge.memberStats(holder.address);
      expect(s.totalCheckIns).to.equal(1);
      expect(s.currentStreak).to.equal(1);
      expect(s.bestStreak).to.equal(1);
      expect(s.points).to.equal(11); // 10 base + min(1,7) streak bonus
      expect(s.earnedBadgeLevel).to.equal(0);
      expect(s.claimedBadgeLevel).to.equal(0);
      expect(s.lastCheckInDay).to.equal(await currentDay());
    });

    async function currentDay() {
      const block = await ethers.provider.getBlock("latest");
      return Math.floor(block.timestamp / DAY);
    }

    it("second check-in on the same day reverts", async function () {
      await lounge.connect(holder).checkIn();
      await expect(lounge.connect(holder).checkIn()).to.be.revertedWith(
        "Already checked in today"
      );
    });

    it("streak increments across consecutive days", async function () {
      await checkInOnConsecutiveDays(holder, 3);
      const s = await lounge.memberStats(holder.address);
      expect(s.totalCheckIns).to.equal(3);
      expect(s.currentStreak).to.equal(3);
      expect(s.bestStreak).to.equal(3);
    });

    it("streak resets after a skipped day but best streak is kept", async function () {
      await checkInOnConsecutiveDays(holder, 3);
      await advanceOneDay(); // the skipped day
      await advanceOneDay(); // the day we check in again
      await lounge.connect(holder).checkIn();

      const s = await lounge.memberStats(holder.address);
      expect(s.totalCheckIns).to.equal(4);
      expect(s.currentStreak).to.equal(1);
      expect(s.bestStreak).to.equal(3);
    });

    it("points follow 10 + min(streak, 7), with the bonus capped", async function () {
      // Streaks 1..9 earn: 11,12,13,14,15,16,17,17,17 = 132 points.
      await checkInOnConsecutiveDays(holder, 9);
      const s = await lounge.memberStats(holder.address);
      expect(s.points).to.equal(132);
      expect(s.currentStreak).to.equal(9);
      expect(s.bestStreak).to.equal(9);
    });

    it("members are tracked independently", async function () {
      await checkInOnConsecutiveDays(holder, 2);
      await lounge.connect(holder2).checkIn();

      const a = await lounge.memberStats(holder.address);
      const b = await lounge.memberStats(holder2.address);
      expect(a.totalCheckIns).to.equal(2);
      expect(b.totalCheckIns).to.equal(1);
      expect(b.currentStreak).to.equal(1);
    });
  });

  describe("guest wall", function () {
    it("stores a message and returns it via getMessages", async function () {
      await lounge.connect(holder).postMessage("First visit to the lounge.");

      expect(await lounge.messageCount()).to.equal(1);
      const page = await lounge.getMessages(0, 20);
      expect(page.length).to.equal(1);
      expect(page[0].author).to.equal(holder.address);
      expect(page[0].text).to.equal("First visit to the lounge.");
      expect(page[0].timestamp).to.be.greaterThan(0);
    });

    it("emits MessagePosted with the array index", async function () {
      await expect(lounge.connect(holder).postMessage("gm"))
        .to.emit(lounge, "MessagePosted")
        .withArgs(0, holder.address);
      await expect(lounge.connect(holder2).postMessage("second"))
        .to.emit(lounge, "MessagePosted")
        .withArgs(1, holder2.address);
    });

    it("returns messages newest-first and respects offset/limit", async function () {
      await lounge.connect(holder).postMessage("one");
      await lounge.connect(holder).postMessage("two");
      await lounge.connect(holder2).postMessage("three");

      const all = await lounge.getMessages(0, 50);
      expect(all.map((m) => m.text)).to.deep.equal(["three", "two", "one"]);

      const page = await lounge.getMessages(1, 1);
      expect(page.length).to.equal(1);
      expect(page[0].text).to.equal("two");

      const pastEnd = await lounge.getMessages(10, 5);
      expect(pastEnd.length).to.equal(0);
    });

    it("rejects empty and over-long messages", async function () {
      await expect(lounge.connect(holder).postMessage("")).to.be.revertedWith(
        "Message empty"
      );
      const tooLong = "a".repeat(281);
      await expect(
        lounge.connect(holder).postMessage(tooLong)
      ).to.be.revertedWith("Message too long");

      const exactlyMax = "a".repeat(280);
      await lounge.connect(holder).postMessage(exactlyMax);
      expect(await lounge.messageCount()).to.equal(1);
    });
  });

  describe("badges", function () {
    it("no badge is claimable before 3 check-ins", async function () {
      await checkInOnConsecutiveDays(holder, 2);
      expect(await lounge.badgeLevel(holder.address)).to.equal(0);
      await expect(lounge.connect(holder).claimBadge()).to.be.revertedWith(
        "No new badge"
      );
    });

    it("badge thresholds: 3 -> L1, 7 -> L2, 14 -> L3, 30 -> L4", async function () {
      await checkInOnConsecutiveDays(holder, 30);
      expect(await lounge.badgeLevel(holder.address)).to.equal(4);
    });

    it("claim flow records each new level exactly once", async function () {
      await checkInOnConsecutiveDays(holder, 3);
      await expect(lounge.connect(holder).claimBadge())
        .to.emit(lounge, "BadgeClaimed")
        .withArgs(holder.address, 1);

      let s = await lounge.memberStats(holder.address);
      expect(s.claimedBadgeLevel).to.equal(1);
      expect(s.earnedBadgeLevel).to.equal(1);

      // Same level cannot be claimed twice.
      await expect(lounge.connect(holder).claimBadge()).to.be.revertedWith(
        "No new badge"
      );

      // Four more days reach 7 total -> level 2 becomes claimable.
      for (let i = 0; i < 4; i++) {
        await advanceOneDay();
        await lounge.connect(holder).checkIn();
      }
      await expect(lounge.connect(holder).claimBadge())
        .to.emit(lounge, "BadgeClaimed")
        .withArgs(holder.address, 2);

      s = await lounge.memberStats(holder.address);
      expect(s.claimedBadgeLevel).to.equal(2);
      expect(s.earnedBadgeLevel).to.equal(2);
    });

    it("claiming can skip levels when several were earned at once", async function () {
      await checkInOnConsecutiveDays(holder, 14);
      await expect(lounge.connect(holder).claimBadge())
        .to.emit(lounge, "BadgeClaimed")
        .withArgs(holder.address, 3);

      const s = await lounge.memberStats(holder.address);
      expect(s.claimedBadgeLevel).to.equal(3);
    });
  });

  describe("views for unknown addresses", function () {
    it("memberStats returns zeros for an address that never visited", async function () {
      const s = await lounge.memberStats(outsider.address);
      expect(s.totalCheckIns).to.equal(0);
      expect(s.currentStreak).to.equal(0);
      expect(s.bestStreak).to.equal(0);
      expect(s.points).to.equal(0);
      expect(s.earnedBadgeLevel).to.equal(0);
      expect(s.claimedBadgeLevel).to.equal(0);
      expect(s.lastCheckInDay).to.equal(0);
    });
  });
});
