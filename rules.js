// Per-actor Init behaviour, game flags and player actions that change the Zelda arena, audited from the decomp
(function (root) {
    "use strict";

    const Sim = root.N64Sim;

    // Actor Init outcomes that matter to the arena: killed straight away, detached from the room, category changes, children
    const INIT = {
        // z_door_warp1.c:183-195 WARP_DESTINATION only stays when Link arrives by warp
        Door_Warp1(w, a) {
            if (a.params === 6 && !w.arrivingByWarp) w.kill(a, "not arriving by warp");
            // z_door_warp1.c:207-265 the adult warp and crystals init a 21-limb skeleton with no tables; Destroy never frees them (:113)
            const p = (a.params << 16) >> 16;
            if (p === -1 || p === -2 || p === 3) {
                w.allocate(0x84, "Door_Warp1 jointTable", false);
                w.allocate(0x84, "Door_Warp1 morphTable", false);
            }
        },
        // z_obj_bean.c:489-526 adult needs the planted bean's switch flag; child always stays
        Obj_Bean(w, a) {
            if (w.flags.adult && !w.switchSet(a.params & 0x3f)) w.kill(a, "adult, no bean planted");
        },
        // z_bg_spot02_objects.c:104-106 type 1 is removed for adult Link
        Bg_Spot02_Objects(w, a) {
            if (w.flags.adult && (a.params & 0xff) === 1) w.kill(a, "adult");
        },
        // z_en_xc.c:304-311 Sheik in Sacred Forest Meadow (params 6) only stays for adult Link before Minuet is learned
        En_Xc(w, a) {
            if (a.params === 6 && (w.event("EVENTCHKINF_50") || !w.flags.adult)) w.kill(a, "Minuet already learned or child");
        },
        // z_en_bom_chu.c:106 a bombchu belongs to no room
        En_Bom_Chu(w, a) {
            a.room = -1;
        },
        // z_en_insect.c:236-240 the first bug out of a bottle spawns two more from its own Init
        En_Insect(w, a) {
            if (a.params !== 2) return;
            for (let i = 1; i <= 2; i++) w.spawn("En_Insect", 3, `bottle bug ${i + 1}`, { home: { pos: a.home.pos.slice(), rot: a.home.rot.slice() } });
        },
        // z_en_wonder_item.c: switch flag in params & 0x3F (0x3F = none); tag points kill themselves
        En_Wonder_Item(w, a) {
            const flag = a.params & 0x3f;
            if (flag !== 0x3f && w.switchSet(flag)) return w.kill(a, "switch flag set");
            const mode = (a.params >> 11) & 0x1f;
            if (mode === 1 || mode === 6) w.kill(a, "tag point");
        },
        En_Horse_Ganon(w, a) {
            // z_en_horse_ganon.c:192 Skin_Init: 53 limbs, one animated limb of 350 vertices; freed by Skin_Free in Destroy (:208)
            skinAllocs(w, a, "En_Horse_Ganon", 53, 350);
        },
        En_Horse_Zelda(w, a) {
            // z_en_horse_zelda.c:173 Skin_Init: 46 limbs, one animated limb of 479 vertices; freed by Skin_Free in Destroy (:190)
            skinAllocs(w, a, "En_Horse_Zelda", 46, 479);
        },
        En_fHG(w, a) {
            // z_en_fhg.c:94-100 sets switch 0x14, then Skin_Init: 53 limbs, one animated limb of 235 vertices; freed by Skin_Free in Destroy (:114)
            w.setSwitch(0x14);
            skinAllocs(w, a, "En_fHG", 53, 235);
        },
        Boss_Fd2(w, a) {
            // z_boss_fd2.c:199 SkelAnime_InitFlex with no tables: 2x ZELDA_ARENA_MALLOC(37 limbs * 6 = 0xDE), freed in Destroy (:213)
            w.allocateFor(a, 0xde, "Boss_Fd2 jointTable", false);
            w.allocateFor(a, 0xde, "Boss_Fd2 morphTable", false);
        },
        Demo_Tre_Lgt(w, a) {
            // z_demo_tre_lgt.c:61 SkelCurve_Init: 14 limbs * 18 = 0xFC, freed in Destroy (:76)
            w.allocateFor(a, 0xfc, "Demo_Tre_Lgt SkelCurve jointTable", false);
        },
        En_Arrow(w, a) {
            // z_en_arrow.c:105-114 a cutscene nut becomes a nut; arrows up to ARROW_0E init a 5-limb skeleton with no tables, freed in Destroy (:165)
            let p = (a.params << 16) >> 16;
            if (p === -10) p = 10;
            if (p <= 8) {
                w.allocateFor(a, 0x1e, "En_Arrow jointTable", false);
                w.allocateFor(a, 0x1e, "En_Arrow morphTable", false);
            }
        },
        En_Bird(w, a) {
            // z_en_bird.c:52 SkelAnime_Init with no tables: 2x ZELDA_ARENA_MALLOC(10 limbs * 6 = 0x3C); Destroy is empty, so they are never freed
            w.allocate(0x3c, "En_Bird jointTable", false);
            w.allocate(0x3c, "En_Bird morphTable", false);
        },
        En_Go(w, a) {
            // z_en_go.c:648 SkelAnime_InitFlex with no tables: 2x ZELDA_ARENA_MALLOC(18 limbs * 6 = 0x6C), freed in Destroy (:717); the EnGo_IsActorSpawned kill is not modelled
            w.allocateFor(a, 0x6c, "En_Go jointTable", false);
            w.allocateFor(a, 0x6c, "En_Go morphTable", false);
        },
        Magic_Wind(w, a) {
            // z_magic_wind.c:58 SkelCurve_Init: 3 limbs * 18 = 0x36, freed in Destroy (:79)
            w.allocateFor(a, 0x36, "Magic_Wind SkelCurve jointTable", false);
        },
        Bg_Breakwall(w, a) {
            // z_bg_breakwall.c:93-127 wallType=(params>>13)&3; types 0-2 killed if switch (params&0x3F) set; type 3 (KD lava cover) never
            const wallType = (a.params >> 13) & 3;
            if (wallType !== 3 && w.switchSet(a.params & 0x3f)) return w.kill(a, "switch flag set (wall already bombed)");
            // Also killed if OBJECT_BWALL (types 0,1) / OBJECT_KINGDODONGO (types 2,3) is not in the scene object list (line 120-124).
            // Otherwise objectSlot is switched to that object in BgBreakwall_WaitForObject (line 222) once loaded.
        },
        Bg_Ddan_Jd(w, a) {
            // z_bg_ddan_jd.c:61 no heap effect (switch flag in params only changes rise speed)
        },
        Bg_Ddan_Kd(w, a) {
            // z_bg_ddan_kd.c:75 no heap effect (switch flag in params only picks lowered/raised state)
        },
        Bg_Dodoago(w, a) {
            // z_bg_dodoago.c:128 no heap effect (switch params&0x3F only picks open-jaw state; effects only after bombing)
        },
        Bg_Haka(w, a) {
            // z_bg_haka.c:51 no heap effect (En_Poh spawn only after Link pulls grave at night in spot02, line 120)
        },
        Bg_Hidan_Curtain(w, a) {
            // z_bg_hidan_curtain.c:81-129 type=(params>>12)&0xF; chest flag=(params>>6)&0x3F
            const type = (a.params >> 12) & 0xf;
            if (type > 6) return w.kill(a, "invalid type");
            const treasureFlag = (a.params >> 6) & 0x3f;
            if (type === 1 && w.chestOpened(treasureFlag)) return w.kill(a, "type 1: chest flag set");
            // type 0 or 6: killed if Flags_GetClear(play, a.room) (room clear flag) - no simulator API for room clear; see NOTES
        },
        Bg_Mjin(w, a) {
            // z_bg_mjin.c:63-73 no flag kills; object-dependent (OBJECT_MJIN if params!=0 else OBJECT_MJIN_OKA)
            // Killed if that object is not in the scene object list; objectSlot switched at runtime once loaded (line 90).
        },
        Bg_Spot00_Break(w, a) {
            // z_bg_spot00_break.c:56 killed if !LINK_IS_ADULT
            if (!w.flags.adult) w.kill(a, "child Link");
        },
        Bg_Spot00_Hanebasi(w, a) {
            // z_bg_spot00_hanebasi.c:80-127 params -1 drawbridge spawns chain 1 (params 0) as child; chain 1 spawns chain 2 (params 1)
            const p = (a.params << 16) >> 16;
            if (p === -1) {
                if (w.flags.adult && !(w.layer >= 4)) return w.kill(a, "adult, not cutscene layer");
                w.spawn("Bg_Spot00_Hanebasi", 0x0000, "drawbridge chain 1", { parent: a });
            } else if (p === 0) {
                w.spawn("Bg_Spot00_Hanebasi", 0x0001, "drawbridge chain 2", { parent: a });
            }
        },
        Bg_Spot01_Fusya(w, a) {
            // z_bg_spot01_fusya.c:53 no heap effect (clears EVENTCHKINF_65 when sceneLayer < 4)
        },
        Bg_Treemouth(w, a) {
            // z_bg_treemouth.c:74 no heap effect on load (Effect_Ss_Hahen only in layer 6 cutscene after cs frame 700, line 134)
        },
        Bg_Umajump(w, a) {
            // z_bg_umajump.c:48-52 params 1 killed unless EVENTCHKINF_EPONA_OBTAINED
            if (a.params === 1 && !w.event("EVENTCHKINF_EPONA_OBTAINED")) w.kill(a, "Epona not obtained");
        },
        Bg_Ydan_Hasi(w, a) {
            // z_bg_ydan_hasi.c:50 no heap effect
        },
        Bg_Ydan_Maruta(w, a) {
            // z_bg_ydan_maruta.c:85 no heap effect (switch params&0xFF only picks ladder state)
        },
        Bg_Ydan_Sp(w, a) {
            // z_bg_ydan_sp.c:109-161 destroyed switch=params&0x3F, burn switch=(params>>6)&0x3F, type=(params>>12)&0xF (0 floor, else wall)
            if (w.switchSet(a.params & 0x3f)) return w.kill(a, "web destroyed switch set");
            const type = (a.params >> 12) & 0xf;
            const burnFlag = (a.params >> 6) & 0x3f;
            // Wall web with burn switch already set burns on first Update (line 411), spawns Effect_Ss_Dead_Db within 3 frames, kills itself after 30 frames
            if (type !== 0 && w.switchSet(burnFlag)) w.effect("Effect_Ss_Dead_Db");
        },
        Boss_Goma(w, a) {
            // z_boss_goma.c:378 SkelAnime_Init with no tables: 2x ZELDA_ARENA_MALLOC(86 limbs * 6 = 0x204), freed in Destroy (:422)
            w.allocateFor(a, 0x204, "Boss_Goma jointTable", false);
            w.allocateFor(a, 0x204, "Boss_Goma morphTable", false);
            // z_boss_goma.c:393-398 if Flags_GetClear(room) (Gohma beaten): kill, SpawnAsChild Door_Warp1 WARP_DUNGEON_CHILD (0), spawn Item_B_Heart 0
            // Room clear flag has no simulator API; the block below is disabled - see NOTES
            if (w.roomCleared(a.room)) {
                w.spawn("Door_Warp1", 0x0000, "blue warp (Gohma beaten)", { parent: a });
                w.spawn("Item_B_Heart", 0x0000, "heart container (Gohma beaten)");
                return w.kill(a, "room clear flag set");
            }
            // Door_Shutter params 0x0180 (SHUTTER_GOHMA_BLOCK) spawned as child when Link is within 60 units of (150,y,350) (line 718, if
            // EVENTCHKINF_BEGAN_GOHMA_BATTLE) or at intro cutscene frame 176 (line 782) - position-dependent, not on load
        },
        Demo_Effect(w, a) {
            // z_demo_effect.c:188-524 effectType=params&0xFF; objectSlot switched at runtime (WaitForObject, line 547)
            const type = a.params & 0xff;
            if (type === 0x08) {
                // DEMO_EFFECT_TRIFORCE_SPOT (line 418-430): crystal light child of this, light ring child of the crystal light
                const crystal = w.spawn("Demo_Effect", 0x0000, "triforce crystal light", { parent: a });
                w.spawn("Demo_Effect", 0x0011, "triforce light ring", { parent: crystal });
            } else if (type === 0x15) {
                // DEMO_EFFECT_JEWEL_ZORA (line 506-510)
                w.changeCategory(a, 9);
                if (w.sceneName === "bdan" && w.inf("INFTABLE_RUTO_HAS_SAPPHIRE")) return w.kill(a, "Ruto already has sapphire");
            }
            // z_demo_effect.c:690 the time warps' first Update once OBJECT_EFC_TW loads: SkelCurve_Init, 2 limbs * 18, freed in Destroy (:535)
            if (type === 0x0f || type === 0x18 || type === 0x19) {
                w.whenObjectsLoaded(a, ["OBJECT_EFC_TW"], () => w.allocateFor(a, 0x24, "Demo_Effect time warp SkelCurve jointTable", false));
            }
        },
        Demo_Im(w, a) {
            // z_demo_im.c:1144 + func_80986D40 (line 969): params 5 is killed on first Update if EVENTCHKINF_ZELDA_FLED_CASTLE
            if (a.params === 5 && w.event("EVENTCHKINF_ZELDA_FLED_CASTLE")) w.kill(a, "Zelda fled castle (first Update)");
            // All other spawns (Door_Warp1, Demo_Effect, Demo_6K, En_Arrow) are cutscene-cue driven only
        },
        Demo_Kankyo(w, a) {
            // z_demo_kankyo.c:204-290 type=params; objectSlot switched at runtime in Draw once required object loaded (line 510)
            const type = a.params;
            if (type === 0x00 || type === 0x01) {
                // BLUE_RAIN: killed outside hiral_demo / tokinoma / spot00 (line 234)
                if (w.sceneName !== "hiral_demo" && w.sceneName !== "tokinoma" && w.sceneName !== "spot00") w.kill(a, "blue rain in wrong scene");
            } else if (type === 0x0d) {
                // DOOR_OF_TIME (line 257-264)
                if (!w.event("EVENTCHKINF_OPENED_DOOR_OF_TIME")) w.spawn("Door_Toki", 0x0000, "door of time collision", { parent: a });
                else return w.kill(a, "door of time already opened");
            } else if (type === 0x0f || type === 0x10) {
                // WARP_OUT / WARP_IN (line 271-274)
                w.changeCategory(a, 7);
                a.room = -1;
            }
        },
        Door_Ana(w, a) {
            // z_door_ana.c:74 no heap effect
        },
        Door_Shutter(w, a) {
            // z_door_shutter.c:426-467 type=(params>>6)&0xF; types 4,6,8 (PG bars / Gohma block styles) detached from room
            const type = (a.params >> 6) & 0xf;
            if (type === 4 || type === 6 || type === 8) a.room = -1;
            // Killed if its style object (per-scene table, OBJECT_GND, OBJECT_GOMA, boss-door object) is absent; objectSlot switched at runtime (line 497)
        },
        Elf_Msg(w, a) {
            // z_elf_msg.c:63-85,104 ElfMsg_KillCheck in Init (and every Update); rotY = home.rot.y (signed), flag=(params>>8)&0x3F
            const rotY = (a.home.rot[1] << 16) >> 16;
            const flag = (a.params >> 8) & 0x3f;
            if (rotY > 0 && rotY < 0x41 && w.switchSet(rotY - 1)) return w.kill(a, "switch (rot.y-1) set");
            if (rotY === -1) return w.roomCleared(a.room) ? w.kill(a, "room clear flag set") : undefined;
            if (flag !== 0x3f && w.switchSet(flag)) w.kill(a, "switch flag set");
        },
        Elf_Msg2(w, a) {
            // z_elf_msg2.c:61-84,90 ElfMsg2_KillCheck in Init (and every Update); rotY = home.rot.y (signed), flag=(params>>8)&0x3F
            const rotY = (a.home.rot[1] << 16) >> 16;
            const flag = (a.params >> 8) & 0x3f;
            if (rotY > 0 && rotY < 0x41 && w.switchSet(rotY - 1)) return w.kill(a, "switch (rot.y-1) set");
            if (rotY === -1) return w.roomCleared(a.room) ? w.kill(a, "room clear flag set") : undefined;
            if (flag !== 0x3f && w.switchSet(flag)) w.kill(a, "switch flag set");
        },
        En_A_Obj(w, a) {
            // z_en_a_keep.c:102,138-150 params&0xFF: 1/2 (BLOCK_LARGE/HUGE) and 3/4 (BLOCK_*_ROT) -> ACTORCAT_BG; no kill/spawn in Init
            const type = a.params & 0xff;
            if (type === 1 || type === 2 || type === 3 || type === 4) w.changeCategory(a, 1);
        },
        En_Am(w, a) {
            // z_en_am.c:236-244 params==ARMOS_STATUE(0) -> ACTORCAT_BG; ARMOS_ENEMY(1) stays ENEMY; no kill/spawn
            if (a.params === 0) w.changeCategory(a, 1);
        },
        En_Bombf(w, a) {
            // z_en_bombf.c:127-132 params==BOMBFLOWER_BODY(0) -> ACTORCAT_EXPLOSIVE; flower (-1/0xFFFF) only spawns bombs on pick-up/hit/burning stick
            if (a.params === 0) w.changeCategory(a, 3);
        },
        En_Box(w, a) {
            // z_en_box.c:141-190 no kill/spawn/category change; treasure flag = params & 0x1F only selects open/closed state
            // (room-clear types 1/7 spawn Demo_Kankyo 0x11 at z_en_box.c:383 only once tempClear for the room is set; see NOTES)
        },
        En_Cow(w, a) {
            // z_en_cow.c:143-158 body (params 0): in link_home killed unless adult && EVENTCHKINF_HORSE_RACE_COW_UNLOCK; else spawns tail child
            if (a.params !== 0) return; // COW_TYPE_TAIL: no heap effect
            if (w.sceneName === "link_home") {
                if (!w.flags.adult) return w.kill(a, "link_home cow, child");
                if (!w.event("EVENTCHKINF_HORSE_RACE_COW_UNLOCK")) return w.kill(a, "link_home cow, not unlocked");
            }
            w.spawn("En_Cow", 1, "cow tail (COW_TYPE_TAIL)", { parent: a });
        },
        En_Cs(w, a) {
            // z_en_cs.c:141 killed unless IS_DAY (nightFlag == 0)
            if (w.flags.night) w.kill(a, "night");
        },
        En_Dekubaba(w, a) {
            // z_en_dekubaba.c:488-491,550 no Init effect; Wait->Grow when xz<200*size && |dy|<30*size, Grow spawns EffectSsHahen every frame
            const size = a.params === 1 ? 2.5 : 1.0; // DEKUBABA_BIG = 1
            if (w.near(a, 200 * size)) w.effect("Effect_Ss_Hahen");
        },
        En_Dekunuts(w, a) {
            // z_en_dekunuts.c:122,137 params!=DEKUNUTS_FLOWER(10): spawns flower child En_Dekunuts params 10 (checked before params&=0xFF)
            if (a.params === 10) return; // flower: no heap effect
            w.spawn("En_Dekunuts", 10, "deku scrub flower", { parent: a });
            // later: emerges if 160<xz (and xz<480 or wait timer 100-150f expired), |dy|<120; Stand->ThrowNut spawns En_Nutsball (z_en_dekunuts.c:320)
        },
        En_Dodojr(w, a) {
            // z_en_dodojr.c:80-96,407-421,433 no Init effect; emerges when xz<320 && (y - playerY)<40, EmergeFromGround spawns EffectSsDust
            if (w.near(a, 320)) w.effect("Effect_Ss_Dust");
        },
        En_Dodongo(w, a) {
            // z_en_dodongo.c:323-360 no kill/spawn; Effect_Add(EFFECT_BLURE1) uses the static effect table, not the arena
            // (after Idle timer Rand_S16Offset(30,50) it Walks and spawns EffectSsDust via Actor_SpawnFloorDustRing, z_en_dodongo.c:569)
        },
        En_Door(w, a) {
            // z_en_door.c:149-152,157-160,164-177 killed if door object slot missing; double door (params&0x40) spawns mirrored child
            // (object: HIDAN->hidan_objects, MIZUsin->mizu_objects, HAKAdan/HAKAdanCH->haka_door, else gameplay_field_keep if loaded, else gameplay_keep)
            if (a.params & 0x40) {
                w.spawn("En_Door", a.params & ~0x40, "double door other half", { parent: a });
            }
        },
        En_Encount1(w, a) {
            // z_en_encount1.c:45,57-104 killed if (s16)params<=0; type=(params>>11)&0x1F; spawns are all Link-position dependent (Update)
            const p = (a.params << 16) >> 16;
            if (p <= 0) return w.kill(a, "params <= 0");
            const type = (a.params >> 11) & 0x1f;
            let maxCur = (a.params >> 6) & 0x1f;
            const range = 120 + 40 * a.home.rot[2];
            if (type === 0) {
                // SPAWNER_LEEVER: timer 30 before first spawn, needs Link on sand floor types 4/7/12; up to 5 (3 in spot13) around Link
                // no immediate spawn on load (timer = 30)
            } else if (type === 1) {
                // SPAWNER_TEKTITE: first Update if |dy|<=100 && xz<=range: one En_Tite TEKTITE_RED(-1), then one per 10 frames up to 2
                if (w.near(a, range)) w.spawn("En_Tite", 0xffff, "red tektite (TEKTITE_RED)", { parent: a });
            } else if (type === 2 || type === 3) {
                const id = type === 3 ? "En_Wf" : "En_Skb";
                const prm = type === 3 ? 0xff00 : 0;
                if (w.sceneName === "spot00") {
                    // Hyrule Field: only at night without Bunny Hood; Link grounded on scene (non-dirt-sfx) floor; spawns relative to Link
                    if (w.flags.night) for (let i = 0; i < maxCur; i++) w.spawn(id, prm, "field night spawn", { parent: a });
                } else if (w.near(a, range)) {
                    // all maxCur spawn in one frame when |dy|<=100 && xz<=range
                    for (let i = 0; i < maxCur; i++) w.spawn(id, prm, "spawner group", { parent: a });
                }
            }
        },
        En_Firefly(w, a) {
            // z_en_firefly.c:172-176,755-785 no kill/spawn; fire (params&0x7FFF <=1) and ice (4) keese spawn EffectSsDust from PostLimbDraw every drawn frame
            const t = a.params & 0x7fff;
            if (t <= 1 || t === 4) w.effect("Effect_Ss_Dust");
        },
        En_Goma(w, a) {
            // z_en_goma.c:139-141 params>=100 (boss limb) -> ACTORCAT_BOSS; eggs 6-9 spawn EffectSsHahen when eggTimer&0xF==0 (50%) (z_en_goma.c:306-316)
            const p = (a.params << 16) >> 16;
            if (p >= 100) return w.changeCategory(a, 9);
            if (p >= 6 && p <= 9) w.effect("Effect_Ss_Hahen");
        },
        En_Goroiwa(w, a) {
            // z_en_goroiwa.c:567-579 killed if (params&0xFF)==0xFF or pathList[params&0xFF].count<2; no spawn in Init
            if ((a.params & 0xff) === 0xff) return w.kill(a, "no path");
            // path point count < 2 also kills (scene path data; see NOTES)
        },
        En_Gs(w, a) {
            // z_en_gs.c:111-128 no heap effect (fairy spawn / switch set only after song/talk)
        },
        En_Hintnuts(w, a) {
            // z_en_hintnuts.c:84,97-106 params!=0xA: kill if textId==0x109B && Flags_GetClear(9); else spawns flower child En_Hintnuts params 0xA
            if (a.params === 0xa) return; // flower: no heap effect
            const prefix1000 = ["ydan", "ydan_boss", "moribossroom", "kokiri_home", "kokiri_home3", "kokiri_home4",
                "kokiri_home5", "kokiri_shop", "link_home", "spot04", "spot05", "spot10"].includes(w.sceneName);
            if (prefix1000 && ((a.params >> 8) & 0xff) === 0x9b) {
                if (w.roomCleared(9)) return w.kill(a, "room 9 cleared");
            }
            w.spawn("En_Hintnuts", 0xa, "business scrub flower", { parent: a });
        },
        En_Holl(w, a) {
            // z_en_holl.c:135-140 no heap effect in Init; a.room is reassigned to a transition side's room when Link crosses (not -1)
        },
        En_Ishi(w, a) {
            // z_en_ishi.c:340-348 large rock (params&1) killed if switch ((params>>10)&0x3C)|((params>>6)&3) set; also killed if bit5 clear and no floor below
            if ((a.params & 1) === 1) {
                const flag = ((a.params >> 10) & 0x3c) | ((a.params >> 6) & 3);
                if (w.switchSet(flag)) return w.kill(a, "large rock switch flag set");
            }
        },
        En_It(w, a) {
            // z_en_it.c:51-57 no heap effect (just sets params=0x0D05 and a collider)
        },
        En_Item00(w, a) {
            // z_en_item00.c:404-411 collectible flag = (params>>8)&0x3F; killed in Init if Flags_GetCollectible(flag); no category change
            const flag = (a.params >> 8) & 0x3f;
            if (w.collected(flag)) return w.kill(a, "collectible flag set");
            // z_en_item00.c:497-523 shields/tunics switch objectSlot to gi_shield_1/gi_shield_2/gi_clothes (Object_GetSlot, no request)
            // z_en_item00.c:533-613 bit 0x8000 = collected immediately (Item_Give / offer GetItem); despawnTimer 15 -> Actor_Kill ~15 frames later
            if (a.params & 0x8000) {
                // killed by EnItem00_Collected once despawnTimer reaches 0 (about 15 frames); see NOTES
            }
        },
        En_Kakasi2(w, a) {
            // z_en_kakasi2.c:81,108-113 switch flag params&0x3F (0x3F none): if set, SkelAnime_InitFlex(NULL tables) -> 2x ZELDA_ARENA_MALLOC(28*6=0xA8)
            const flag = a.params & 0x3f;
            if (flag !== 0x3f && w.switchSet(flag)) {
                // jointTable and morphTable, never freed because Destroy lacks SkelAnime_Free
                w.allocate(0xa8, "En_Kakasi2 jointTable", false);
                w.allocate(0xa8, "En_Kakasi2 morphTable", false);
            }
            // otherwise the same two 0xA8 allocs happen later when Scarecrow's Song is played within range with EVENTCHKINF_9C set
        },
        En_Kanban(w, a) {
            // z_en_kanban.c:230 Init only sets text/collider; pieces spawn only when the sign is cut. No heap effect.
        },

        En_Karebaba(w, a) {
            // z_en_karebaba.c:104 Init no kill/spawn; Idle (z_en_karebaba.c:248) wakes if xzDist<200 && |yDist|<30, Awaken spawns Hahen every frame (:262)
            // params==0 -> Grow (scale 0->full over 20 frames, then Idle); else Idle directly.
            if (w.near(a, 200)) w.effect("Effect_Ss_Hahen"); // also needs |yDistToPlayer| < 30 (after 20 grow frames if params==0)
        },

        En_Ko(w, a) {
            // z_en_ko.c:1167 Init (type check + EnKo_CanSpawn z_en_ko.c:1020); first Update func_80A99048 z_en_ko.c:1185 (type 7 rot.z kill :1197, En_Elf :1218)
            const type = a.params & 0xff; // ENKO_TYPE; 0..11 = CHILD_0..11, 12 = FADO, >=13 invalid
            if (type >= 13) return w.kill(a, "invalid ENKO_TYPE");
            // Also killed in Init if OBJECT_OS_ANIME or the head/body/legs objects (OBJECT_KM1/KW1/FA + boy/girl skel objects) are not in the scene object list.
            const adult = w.flags.adult;
            const adultNoMed = adult && !w.hasQuest("QUEST_MEDALLION_FOREST");
            let ok;
            switch (w.sceneName) {
                case "spot04": // SCENE_KOKIRI_FOREST: types 7..11 never; everyone gone as adult before Forest Medallion
                    ok = !(type >= 7 && type !== 12) && !adultNoMed;
                    break;
                case "kokiri_home": // SCENE_KNOW_IT_ALL_BROS_HOUSE: only types 7, 8, 11 (any age/progress)
                    ok = type === 7 || type === 8 || type === 11;
                    break;
                case "kokiri_home3": // SCENE_TWINS_HOUSE: adult w/o medallion -> types 1, 9; otherwise type 9 only
                    ok = adultNoMed ? (type === 1 || type === 9) : type === 9;
                    break;
                case "kokiri_home4": // SCENE_MIDOS_HOUSE: only adult w/o medallion, types 0, 4
                    ok = adultNoMed && (type === 0 || type === 4);
                    break;
                case "kokiri_home5": // SCENE_SARIAS_HOUSE: only adult w/o medallion, type 6
                    ok = adultNoMed && type === 6;
                    break;
                case "kokiri_shop": // SCENE_KOKIRI_SHOP: adult w/o medallion -> types 5, 10; otherwise type 10 only
                    ok = adultNoMed ? (type === 5 || type === 10) : type === 10;
                    break;
                case "spot10": // SCENE_LOST_WOODS: any type, iff INV_CONTENT(ITEM_TRADE_ADULT) == ITEM_ODD_POTION (current trade item exactly)
                    ok = w.hasItem("ITEM_ODD_POTION");
                    break;
                default:
                    ok = false;
            }
            if (!ok) return w.kill(a, "EnKo_CanSpawn false");
            // first Update, once its skeleton, head and animation objects are loaded (z_en_ko.c EnKo_AreObjectsLoaded)
            const girl = [1, 5, 6, 9, 10, 12].includes(type);
            const objects = [girl ? "OBJECT_KW1" : "OBJECT_KM1", "OBJECT_OS_ANIME", ...(type === 12 ? ["OBJECT_FA"] : [])];
            w.whenObjectsLoaded(a, objects, () => {
                const rotZ = a.home.rot[2];
                if (type === 7 && (adultNoMed ? rotZ !== 1 : rotZ !== 0)) return w.kill(a, "type 7 variant rot.z");
                w.spawn("En_Elf", 3, "kokiri fairy", { parent: a });
            });
            // objectSlot is changed at runtime to legsObjectSlot (skeleton object) in func_80A99048.
        },

        En_Kusa(w, a) {
            // z_en_kusa.c:244 Init: kill if no floor under it (:264) or required object missing (:269-275); WaitForObject (:292) switches objectSlot
            // type = params & 3: 0 -> OBJECT_GAMEPLAY_FIELD_KEEP, 1/2 -> OBJECT_KUSA (killed if that object is not loaded in the scene)
            // No spawns/effects until cut or lifted (lifting sets room = -1 temporarily).
        },

        En_Mag(w, a) {
            // z_en_mag.c:82 title-screen logo; Init only sets registers/fields. No heap effect.
        },

        En_Md(w, a) {
            // z_en_md.c:685 Init; EnMd_ShouldSpawn z_en_md.c:539; En_Elf child z_en_md.c:704
            const letter = w.event("EVENTCHKINF_OBTAINED_ZELDAS_LETTER"); // 0x40
            const f1c = w.event("EVENTCHKINF_1C"); // set when Mido walks away after you show him sword+shield with Kokiri Emerald
            let spawn = false;
            if (w.sceneName === "spot04" && !f1c && !letter) spawn = true; // Kokiri Forest
            if (w.sceneName === "kokiri_home4" && (f1c || letter) && !w.flags.adult) spawn = true; // Mido's House
            if (w.sceneName === "spot10") spawn = true; // Lost Woods: always (any age/flags)
            if (!spawn) return w.kill(a, "EnMd_ShouldSpawn false");
            w.spawn("En_Elf", 3, "Mido's fairy", { parent: a });
            // Position only (no heap effect): BlockPath at spawn pos if (spot04 && !EVENTCHKINF_04) || (spot04 && EVENTCHKINF_04 && QUEST_KOKIRI_EMERALD)
            // || (spot10 && !EVENTCHKINF_0A); otherwise (not Mido's House) warped to last point of path (params>>8)&0xFF (0xFF = none) and Idle.
        },

        En_Mm(w, a) {
            // z_en_mm.c:172 Running Man; Init picks run/sit by dayTime, no kill/spawn. No heap effect.
        },

        En_Okarina_Tag(w, a) {
            // z_en_okarina_tag.c:59 Init; kill checks z_en_okarina_tag.c:94-119
            const flag = a.params & 0x3f; // 0x3F = none
            if (flag !== 0x3f && w.switchSet(flag)) return w.kill(a, "switch flag set");
            const type = (a.params >> 10) & 0x3f;
            if (type === 2 && w.flags.adult) return w.kill(a, "type 2 (Song of Storms tag) adult");
            if (![1, 2, 4, 5, 6, 7].includes(type)) w.kill(a, "unhandled type");
        },

        En_Okuta(w, a) {
            // z_en_okuta.c:130 Init: params &= 0xFF; type 0 killed if no water surface above floor (:151-154); projectile -> ACTORCAT_PROP (:165)
            const p = a.params & 0xff;
            if (p !== 0) return w.changeCategory(a, 6); // projectile (spawned by a shooting Octorok)
            // p==0: Actor_Kill if BgCheck_GetWaterSurface fails or surface <= floor (geometry dependent; normally survives).
            // WaitToAppear (z_en_okuta.c:297): appears when 200 < xzDist < 480 -> 10x EffectSsBubble, then ripples every 7 frames while visible
            if (w.near(a, 480) && !w.near(a, 200)) {
                w.effect("Effect_Ss_Bubble");
                w.effect("Effect_Ss_G_Ripple");
            }
        },

        En_Owl(w, a) {
            // z_en_owl.c:128 Init; kills z_en_owl.c:158-240
            let owlType = (a.params >> 6) & 0x3f;
            let sw = a.params & 0x3f;
            if (a.params === 0xfff) { owlType = 1; sw = 0x20; }
            if (owlType !== 0 && sw < 0x20 && w.switchSet(sw)) return w.kill(a, "switch flag set");
            const letter = w.event("EVENTCHKINF_OBTAINED_ZELDAS_LETTER");
            switch (owlType) {
                case 3: if (letter) return w.kill(a, "OWL_KAKARIKO: has Zelda's letter"); break;
                case 4: if (w.event("EVENTCHKINF_43")) return w.kill(a, "OWL_HYLIA_GERUDO: EVENTCHKINF_43"); break;
                case 6: if (w.event("EVENTCHKINF_39") || !letter) return w.kill(a, "OWL_ZORA_RIVER"); break;
                case 7: w.unsetSwitch(0x23); break; // OWL_HYLIA_SHORTCUT
                case 11: if (!w.hasQuest("QUEST_SONG_LULLABY")) return w.kill(a, "OWL_LOST_WOODS_PRESARIA: no lullaby"); break;
                case 12: if (!w.hasQuest("QUEST_SONG_SARIA")) return w.kill(a, "OWL_LOST_WOODS_POSTSARIA: no Saria's song"); break;
            }
        },

        En_Peehat(w, a) {
            // z_en_peehat.c:209 Init no kill/spawn; Ground_StateGround (:345) / Flying_StateGrounded (:382) rise only if IS_DAY and near
            const p = (a.params << 16) >> 16; // -1 grounded, 0 flying, 1 larva
            const day = !w.flags.night;
            if (p === -1 && day && w.near(a, 740)) {
                w.effect("Effect_Ss_Hahen"); // EnPeehat_SpawnDust every rise frame
                w.effect("Effect_Ss_Dust"); // func_80033480 once blade speed maxed and low to floor
            } else if (p === 0 && day && w.near(a, 2800)) {
                w.effect("Effect_Ss_Hahen");
                w.effect("Effect_Ss_Dust");
                // then Flying_StateFly (:408): every 8th gameplay frame while xzDist < 1400, up to 3 larvae
                if (w.near(a, 1400)) for (let i = 0; i < 3; i++) w.spawn("En_Peehat", 1, "larva", { parent: a });
            }
        },

        En_Po_Field(w, a) {
            // z_en_po_field.c:168 Init: static sNumSpawned counts Inits since overlay load; every En_Po_Field after the first is killed (:179-182)
            const statics = w.overlayStatics(a);
            statics.numSpawned = (statics.numSpawned || 0) + 1;
            if (statics.numSpawned > 1) return w.kill(a, "not the first En_Po_Field since its code loaded");
            // Survivor: Actor_ChangeCategory(ACTORCAT_ENEMY) (:210, same as profile category), LightContext_InsertLight (light pool, not arena).
        },

        En_Poh(w, a) {
            // z_en_poh.c:201 Init; kills z_en_poh.c:223-261 (note: Actor_Kill here does not return); object switch in EnPoh_Update z_en_poh.c:923
            let p = (a.params << 16) >> 16;
            if (p >= 4) p = 0; // EN_POH_NORMAL
            if (p === 1) { // EN_POH_RUPEE: static D_80AE1A50 ++ ; kill when it reaches 3 (Destroy decrements)
                const statics = w.overlayStatics(a);
                statics.rupeePoes = (statics.rupeePoes || 0) + 1;
                if (statics.rupeePoes >= 3) w.kill(a, "3rd rupee poe");
                const it = w.spawn("En_Item00", 0x0001, "blue rupee drop (Item_DropCollectible 0x4000|ITEM00_RUPEE_BLUE)");
                if (it) it.room = -1; // Item_DropCollectible sets room = -1 on the drop
            } else if (p === 3) { // EN_POH_FLAT
                if (w.switchSet(0x28) || w.switchSet(0x9)) w.kill(a, "Flat already spawned/defeated");
                else w.setSwitch(0x28);
            } else if (p === 2) { // EN_POH_SHARP
                if (w.switchSet(0x29) || w.switchSet(0x9)) w.kill(a, "Sharp already spawned/defeated");
                else w.setSwitch(0x29);
            }
            // requires OBJECT_POH (p<2) or OBJECT_PO_COMPOSER (p>=2) in scene object list, else Actor_Kill; objectSlot switched at first Update.
        },

        En_River_Sound(w, a) {
            // z_en_river_sound.c:37 Init kills (:44-55); first Update z_en_river_sound.c:239 kills in ddan_boss when room cleared
            const p = a.params & 0xff;
            if (p >= 0xf8) return w.kill(a, "RS_GANON_TOWER_x (sets BGM volume)");
            if (p === 0xf7) return w.kill(a, "RS_NATURE_AMBIENCE (starts ambience)");
            if (p === 0x0c && (!w.hasQuest("QUEST_SONG_LULLABY") || w.hasQuest("QUEST_SONG_SARIA"))) return w.kill(a, "Lost Woods Saria's song not active");
            // Update: if p not in {0x00,0x04,0x05,0x0D,0x13} and sceneName === "ddan_boss" and Flags_GetClear(room) -> Actor_Kill (room-clear flag, not in API)
        },

        En_Sa(w, a) {
            // z_en_sa.c:513 Init; EnSa_GetType z_en_sa.c:415; kill on SARIA_TYPE_NONE z_en_sa.c:551; En_Elf z_en_sa.c:563
            const cs = w.flags.cutsceneIndex;
            const letter = w.event("EVENTCHKINF_OBTAINED_ZELDAS_LETTER");
            let keep = false;
            if (cs >= 0xfff0 && cs !== 0xfffd && (w.sceneName === "spot04" || w.sceneName === "spot05")) {
                keep = true; // spot04 -> SARIA_TYPE_GREETING (sets csCtx.script + cutsceneTrigger), spot05 -> MEADOW_WAITING
            } else if (w.sceneName === "kokiri_home5" && !w.flags.adult && w.hasItem("ITEM_OCARINA_FAIRY") && !letter) {
                keep = true; // Saria's House: SARIA_TYPE_STANDING (ocarina slot must hold exactly the Fairy Ocarina)
            } else if (w.sceneName === "spot05" && letter) {
                keep = true; // Sacred Forest Meadow: MEADOW_PLAYING if QUEST_SONG_SARIA else MEADOW_WAITING
            } else if (w.sceneName === "spot04" && !w.hasQuest("QUEST_KOKIRI_EMERALD")) {
                keep = true; // Kokiri Forest: STANDING if INFTABLE_SARIA_GREETED_LINK else GREETING (cutscene)
            }
            if (!keep) return w.kill(a, "SARIA_TYPE_NONE");
            w.spawn("En_Elf", 3, "Saria's fairy", { parent: a });
        },

        En_Shopnuts(w, a) {
            // z_en_shopnuts.c:76 Init; kill z_en_shopnuts.c:90-95 (type = full params)
            const t = a.params;
            if ((t === 2 && w.itemGetInf("ITEMGETINF_DEKU_HEART_PIECE")) ||
                (t === 9 && w.inf("INFTABLE_HAS_DEKU_STICK_UPGRADE")) ||
                (t === 10 && w.inf("INFTABLE_HAS_DEKU_NUT_UPGRADE"))) {
                return w.kill(a, "upgrade/heart piece already bought");
            }
            // Nut throws (En_Nutsball) / En_Dns salesman spawn only after player interaction.
        },

        En_St(w, a) {
            // z_en_st.c:806 Init: blure effect (Effect_Add, static pool) only; drops when Link within 160 xz and below it -> EffectSsBlast on landing (z_en_st.c:918)
            if (w.near(a, 160)) w.effect("Effect_Ss_Blast"); // only if it starts on the ceiling and Link is 0..400 units below
        },

        En_Sw(w, a) {
            // z_en_sw.c:248 Init: params fixup (:254-262), GS token kill (:265), type 0 -> ACTORCAT_ENEMY (:322)
            let p = a.params & 0xffff;
            if (p & 0x8000) {
                const t0 = ((p - 0x8000) >> 13 & 7) + 1;
                p = (p & 0x1fff) | (t0 << 13);
            }
            const type = (p >> 13) & 7; // 0 = Skullwalltula, >0 = Gold Skulltula
            if (type > 0) p = (p & ~0x1f00) | ((((p >> 8) & 0x1f) - 1) << 8);
            // Kill if GET_GS_FLAGS((p >> 8) & 0x1F) & (p & 0xFF)  (token already collected; GS flags not in API)
            if (type === 0) w.changeCategory(a, 5);
        },

        En_Tk(w, a) {
            // z_en_tk.c:492 Init; kill z_en_tk.c:507-511: dayTime <= CLOCK_TIME(18,0) (0xC000) || >= CLOCK_TIME(21,0) (0xE000) || adult || not Graveyard
            const t = w.dayTime; // exact dayTime if the simulator has it; falls back to night flag
            const inWindow = t !== undefined ? (t > 0xc000 && t < 0xe000) : w.flags.night;
            if (!inWindow || w.flags.adult || w.sceneName !== "spot02") w.kill(a, "Dampe: not child 18:00-21:00 in Graveyard");
        },

        En_Trap(w, a) {
            // z_en_trap.c:75 Init only sets motion params. No heap effect.
        },

        En_Viewer(w, a) {
            // z_en_viewer.c:111 Init spawns cape for Ganondorf types (:122-126); InitImpl z_en_viewer.c:188 waits for objects, sets objectSlot, allocates tables
            const type = (a.params >> 8) & 0xff;
            if (type === 3 || type === 5 || type === 7 || type === 8 || type === 9) {
                w.spawn("En_Ganon_Mant", 35, "Ganondorf cape", { parent: a });
            }
            // First Update when objects loaded: SkelAnime_Init/InitFlex with NULL tables -> 2x ZELDA_ARENA_MALLOC(limbCount*6);
            // horse types 0,4,6 use Skin_Init -> vtxTable malloc + 2 Vtx bufs per animated limb + SkelAnime_InitSkin tables.
        },
        En_Vm(w, a) {
            // z_en_vm.c:149 EnVm_Init: skeleton/colliders only; no heap effect
        },

        En_Weather_Tag(w, a) {
            // z_en_weather_tag.c:63-126 type = params & 0xF; kills at :80/:90/:100/:109/:120 (Init continues after kill, harmless)
            const type = a.params & 0xf;
            if (type === 1 && w.event("EVENTCHKINF_EPONA_OBTAINED")) return w.kill(a, "LLR cloudy: Epona obtained");
            if (type === 2 && w.event("EVENTCHKINF_4A")) return w.kill(a, "ZD snow: EVENTCHKINF_4A");
            if (type === 3 && w.event("EVENTCHKINF_4A")) return w.kill(a, "LH rain: EVENTCHKINF_4A");
            if (type === 4 && w.event("EVENTCHKINF_49")) return w.kill(a, "DMT cloudy: EVENTCHKINF_49");
            if (type === 5 && (!w.event("EVENTCHKINF_48") || !w.event("EVENTCHKINF_49") || !w.event("EVENTCHKINF_4A") ||
                               w.hasQuest("QUEST_MEDALLION_SHADOW")))
                return w.kill(a, "Kak storm: needs 48/49/4A and no Shadow medallion");
            // types 0 (market), 6 (sandstorm), 7 (graveyard storm): never killed in Init
        },

        En_Wonder_Talk(w, a) {
            // z_en_wonder_talk.c:42-65 Init kill (:59); first Update func_80B391CC kill (:116)
            const flag = a.params & 0x3f; // 0x3F = none
            if (flag !== 0x3f && w.switchSet(flag)) return w.kill(a, "switch flag set");
            const kind = (a.params >> 11) & 0x1f;
            // first Update (needs actor inside culling volume: FLAGS lacks UPDATE_CULLING_DISABLED)
            if (kind === 4 && w.event("EVENTCHKINF_1D")) w.kill(a, "type 4 and EVENTCHKINF_1D (first Update)");
        },

        En_Wonder_Talk2(w, a) {
            // z_en_wonder_talk2.c:47-107 kill at :92
            const flag = a.params & 0x3f; // 0x3F = none
            if (flag !== 0x3f && w.switchSet(flag)) w.kill(a, "switch flag set");
        },

        En_Wood02(w, a) {
            // z_en_wood02.c:175-311 Init; offspring spawn :287 via SpawnOffspring :130-172; cleanup in Update :318-337
            const type = a.params & 0xff;
            const raw14C = (a.params >> 8) & 0xff;
            const unk14C = (a.home.rot[2] !== 0 || (raw14C & 0x80)) ? -1 : raw14C;
            const SPAWNERS = [0x03, 0x06, 0x08, 0x0d, 0x0f, 0x13, 0x15];
            if (!SPAWNERS.includes(type)) return; // NORMAL/SPAWNED types: no spawns (SPAWNED types raycast down, kill if no floor)
            const large = (type === 0x0f || type === 0x15);
            const cullDist = 4000, cullScale = large ? 2000 : 800, cullDown = large ? 2400 : 1800;
            const DIST = [707, 525, 510, 500, 566], ANG = [0x1fff, 0x4c9e, 0x77f5, 0xa5c9, 0xd6c3];
            const extraRot = type === 0x0f ? 0x4000 : 0;
            const nib = unk14C < 0 ? 0xf : (unk14C & 0xf); // drawType |= unk_14C << 4 (u8)
            const childParams = (nib << 8) | (type + 1);
            const sinS = (s) => Math.sin(((s << 16) >> 16) * Math.PI / 32768);
            const cosS = (s) => Math.cos(((s << 16) >> 16) * Math.PI / 32768);
            for (let i = 4; i >= 0; i--) {
                const ang = (ANG[i] + a.home.rot[1] + extraRot) & 0xffff;
                const x = DIST[i] * sinS(ang) + a.home.pos[0];
                const y = a.home.pos[1];
                const z = DIST[i] * cosS(ang) + a.home.pos[2];
                // EnWood02_SpawnZoneCheck with play->viewProjectionMtxF == identity (Actor_InitContext, z_actor.c:2345),
                // true on the first frame after a scene load (actor entries spawned in Actor_UpdateAll before first Play_Draw)
                const inZone = (-cullScale < z) && (z < cullDist + cullScale) && (Math.abs(x) - cullScale < 1) &&
                               (y + cullDown > -1) && (y - cullScale < 1);
                if (inZone) w.spawn("En_Wood02", childParams, "wood02 offspring " + i, { parent: a });
            }
            // after spawning, spawner moves 141 units along angle 0xA000+rotY+extraRot, raycasts down; kill if no floor (:291-305)
        },

        En_Zf(w, a) {
            // z_en_zf.c:349-420 paired Lizalfos (low byte 0 or 1) kill at :416
            let type = a.params & 0xff;
            if (type & 0x80) type -= 0x100; // sign-extended: -2 Dinolfos, -1 single Lizalfos, 0/1 paired miniboss
            const flag = (a.params >> 8) & 0xff;
            if (type >= 0) {
                // also killed if |Link.y - actor.y| > 100 at Init time (position dependent, see NOTES)
                if (w.switchSet(flag)) w.kill(a, "paired lizalfos: switch flag set");
            }
        },

        En_Zl2(w, a) {
            // z_en_zl2.c:1652 SkelAnime_InitFlex with no tables: 2x ZELDA_ARENA_MALLOC(15 limbs * 6 = 0x5A), freed in Destroy
            w.allocateFor(a, 0x5a, "En_Zl2 jointTable", false);
            w.allocateFor(a, 0x5a, "En_Zl2 morphTable", false);
        },

        Item_Ocarina(w, a) {
            // z_item_ocarina.c:50-83 kill :70/:77, Elf_Msg2 spawn :73; bubble effect in WaitInWater :194-196
            const p = a.params;
            if (p === 0 || p === 1 || p === 2) return;
            if (p !== 3) return w.kill(a, "invalid params");
            if (!w.event("EVENTCHKINF_ZELDA_FLED_CASTLE") || w.event("EVENTCHKINF_43"))
                return w.kill(a, "OoT in moat: Zelda not fled or already taken");
            w.spawn("Elf_Msg2", 0x3800, "ocarina navi msg"); // pos (299,-140,884) rot (0,4,1)
            w.effect("Effect_Ss_Bubble"); // first Update where (gameplayFrames & 13) == 0, i.e. within a few frames
        },

        Item_Shield(w, a) {
            // z_item_shield.c:74-102 Init no heap; params 1 goes func_80B86F68 (frame 1) -> func_80B86CA8 FireTail (frame 2+, :188)
            if (a.params === 1) w.effect("Effect_Ss_Fire_Tail");
        },

        Obj_Bombiwa(w, a) {
            // z_obj_bombiwa.c:84-99 kill at :88
            if (w.switchSet(a.params & 0x3f)) w.kill(a, "switch flag set");
        },

        Obj_Dekujr(w, a) {
            // z_obj_dekujr.c:58-83 kills at :64 and :74 (CS_INDEX_0 = 0xFFF0)
            if (w.flags.cutsceneIndex < 0xfff0 && !w.flags.adult) return w.kill(a, "child outside cutscene");
            if (!w.hasQuest("QUEST_MEDALLION_FOREST")) w.kill(a, "no Forest Medallion");
        },

        Obj_Hamishi(w, a) {
            // z_obj_hamishi.c:150-170 kill at :166
            if (w.switchSet(a.params & 0x3f)) w.kill(a, "switch flag set");
        },

        Obj_Hana(w, a) {
            // z_obj_hana.c:77-96 kill at :95 (type = params & 3)
            if ((a.params & 3) === 2 && w.event("EVENTCHKINF_OBTAINED_ZELDAS_LETTER")) w.kill(a, "bush type 2 after Zelda's Letter");
        },

        Obj_Hsblock(w, a) {
            // z_obj_hsblock.c:93-114 ice spawn via func_80B93BF0 :85-90 when params bit 5 set
            if ((a.params >> 5) & 1) w.spawn("Obj_Ice_Poly", 1, "hsblock ice", { parent: a });
        },

        Obj_Kibako2(w, a) {
            // z_obj_kibako2.c:128-145 Init: dynapoly/collider only; no heap effect (home.rot.z zeroed so Idle never auto-breaks)
        },

        Obj_Lift(w, a) {
            // z_obj_lift.c:122-138 kill at :128
            if (w.switchSet((a.params >> 2) & 0x3f)) w.kill(a, "switch flag set");
        },

        Obj_Makekinsuta(w, a) {
            // z_obj_makekinsuta.c:35-48 Init no heap; En_Sw spawned only after bean plant sets unk_152 (:52-55)
        },

        Obj_Makeoshihiki(w, a) {
            // z_obj_makeoshihiki.c:65-96 SpawnAsChild Obj_Oshihiki at :80; block = sBlocks[home.rot.z & 1]
            // child params = ((0xFF << 6) & 0xC0) | type | 0xFF00: block 0 LARGE_START_ON(2), block 1 SMALL_START_ON(0)
            const childParams = (a.home.rot[2] & 1) ? 0xffc0 : 0xffc2;
            w.spawn("Obj_Oshihiki", childParams, "makeoshihiki block", { parent: a }); // Makeoshihiki killed only if spawn fails
        },

        Obj_Mure(w, a) {
            // z_obj_mure.c:96-127 Init kills :107/:112/:115; spawn in CulledState :301-307 (2nd Update), despawn :425
            const chNum = (a.params >> 12) & 0xf, ptn = (a.params >> 8) & 7;
            const svNum = (a.params >> 5) & 3, type = a.params & 0x1f;
            if (ptn >= 4) return w.kill(a, "ptn >= 4");
            if (type >= 5) return w.kill(a, "type >= 5");
            if (type === 0 || type === 1) return w.kill(a, "grass/undefined type: no culling set");
            const count = chNum !== 0 ? chNum : [12, 9, 8, 0][ptn];
            const ids = { 2: "En_Fish", 3: "En_Insect", 4: "En_Butte" };
            const prm = { 2: 0xffff /* EN_FISH_TYPE_NORMAL (-1) */, 3: 0 /* INSECT_TYPE_PERMANENT */, 4: 0xffff /* -1 */ };
            // spawn when |projectedPos.z| < 1000 (camera depth, not Link distance); kill children when >= 1040
            if (svNum >= 2) return; // svNum 2/3: ObjMure_SpawnActors spawns nothing
            // the children appear on its second Update when Link is in range, and go when he leaves
            w.proximity(a, 1000, 1040, () => {
                const list = [];
                for (let i = 0; i < count; i++) {
                    const p = (svNum === 1 && type === 4 && i === 0) ? 1 : prm[type];
                    list.push(w.spawn(ids[type], p, "mure child " + i, { home: a.home })); // plain Actor_Spawn, child.room = mure.room
                }
                return list;
            });
        },

        Obj_Mure2(w, a) {
            // z_obj_mure2.c:175-182 Init no heap; spawn func_80B9A668 :197-204 (2nd Update), cleanup func_80B9A6F8 :210-218
            const t = a.params & 3;
            if (t === 3) return; // out-of-bounds tables for type 3 (see NOTES)
            const count = [9, 12, 8][t];
            const id = t === 2 ? "En_Ishi" : "En_Kusa";
            let drop = (a.params >> 8) & 0xf;
            if (drop >= 13) drop = 0;
            // spawn when camera-space sqrt(projX^2+projZ^2) < 1600 (x2 = 3200 during cutscene); kill children when >= 1705 (3410 cs)
            // the children appear on its second Update when Link is in range, and go when he leaves
            w.proximity(a, 1600, 1705, () => {
                const list = [];
                for (let i = 0; i < count; i++) list.push(w.spawn(id, drop << 8, "mure2 child " + i, { home: a.home })); // plain Actor_Spawn, room = mure2.room
                return list;
            });
        },

        Obj_Mure3(w, a) {
            // z_obj_mure3.c:150-159 Init kill :154; spawn func_80B9AF64 :177-185 (2nd Update), cleanup func_80B9AFFC :191-198
            if (w.switchSet(a.params & 0x3f)) return w.kill(a, "switch flag set");
            const t = (a.params >> 13) & 7;
            // spawn when camera-space sqrt(projX^2+projZ^2) < 1150; kill rupees when >= 1450
            // the rupees appear on its second Update when Link is in range, and go when he leaves
            w.proximity(a, 1150, 1450, () => {
                const list = [];
                const rupee = (params, tag) => list.push(w.spawn("En_Item00", params, tag, { home: a.home }));
                if (t === 0) for (let i = 0; i < 5; i++) rupee(1, "mure3 blue rupee " + i); // vertical column
                else if (t === 1) for (let i = 0; i < 5; i++) rupee(0, "mure3 green rupee " + i); // line
                else if (t === 2) {
                    for (let i = 0; i < 6; i++) rupee(0, "mure3 green rupee " + i); // circle r=40
                    rupee(2, "mure3 red rupee"); // centre
                }
                return list;
            });
            // t >= 3: spawnFuncs[] out of bounds (undefined)
        },

        Obj_Oshihiki(w, a) {
            // z_obj_oshihiki.c:289-325 kills at :302/:311 (flag field (params>>8)&0xFF only checked if <= 0x3F)
            const field = (a.params >> 8) & 0xff;
            const type = a.params & 0xf;
            if (field <= 0x3f) {
                const set = w.switchSet(field & 0x3f);
                if (set && type <= 3) return w.kill(a, "START_ON block, switch flag set");
                if (!set && type >= 4 && type <= 7) return w.kill(a, "START_OFF block, switch flag clear");
            }
        },

        Obj_Switch(w, a) {
            // z_obj_switch.c:301-367 ice spawn at :333 via ObjSwitch_SpawnIce :252-258 when frozen bit 7 set
            if ((a.params >> 7) & 1) w.spawn("Obj_Ice_Poly", ((a.params >> 8) & 0x3f) << 8, "switch ice", { parent: a });
        },

        Obj_Syokudai(w, a) {
            // z_obj_syokudai.c:91-121 Init: colliders + LightContext_InsertLight (light pool, not arena); no heap effect
        },

        Obj_Tsubo(w, a) {
            // z_obj_tsubo.c:141-160 kills :148 (no floor below) and :155 (required object not in scene); objectSlot swap :240-246
            // required object: params bit 8 = 0 -> OBJECT_GAMEPLAY_DANGEON_KEEP, 1 -> OBJECT_TSUBO (Object_GetSlot only, no load request)
        },

        Object_Kankyo(w, a) {
            // z_object_kankyo.c:85-179 room=-1 at :94 for every params; sIsSpawned guard :97-111; ChangeCategory :121
            a.room = -1;
            const p = a.params;
            if (p === 0 || p === 3) {
                // static u8 sIsSpawned (overlay .data), shared by params 0 and 3; reset only when overlay is reloaded
                if (w.overlayStatics(a).sIsSpawned) return w.kill(a, "sIsSpawned already set (fairies/snow)");
                w.overlayStatics(a).sIsSpawned = true;
            } else if (p === 4) {
                w.changeCategory(a, 7); // ACTORCAT_ITEMACTION (same as profile); then waits on OBJECT_SPOT02_OBJECTS slot
            }
            // p === 2 lightning: nothing; p === 5 beams: event flag reads only, waits on OBJECT_DEMO_KEKKAI slot; others: nothing
        },

        Shot_Sun(w, a) {
            // z_shot_sun.c:77-96 Init: collider or flags only; no heap effect (fairy/sparkle spawns need ocarina or sun hit)
        },
        Bg_Bdan_Objects(w, a) {
            // z_bg_bdan_objects.c:152-175 type=params&0xFF; big octo platform (0) spawns En_Bigokuta 3 as child if !room clear && INFTABLE_RUTO_ABDUCTED
            if ((a.params & 0xff) !== 0 || w.roomCleared(a.room) || !w.inf("INFTABLE_RUTO_ABDUCTED")) return;
            const rotY = ((a.home.rot[1] + 0x8000) << 16) >> 16;
            w.spawn("En_Bigokuta", 0x0003, "Big Octo (platform battle in progress)", { parent: a, home: { pos: a.home.pos.slice(), rot: [0, rotY, 0] } });
        },
        Bg_Bdan_Switch(w, a) {
            // z_bg_bdan_switch.c:212-216 type=params&0xFF; invalid type (>4) is killed
            if ((a.params & 0xff) > 4) w.kill(a, "invalid type");
        },
        Bg_Bom_Guard(w, a) {
            // z_bg_bom_guard.c:42 no heap effect (Update only scans NPC list for En_Bom_Bowl_Man)
        },
        Bg_Bombwall(w, a) {
            // z_bg_bombwall.c:133 no heap effect (switch params&0x3F only picks broken state; never killed)
        },
        Bg_Bowl_Wall(w, a) {
            // z_bg_bowl_wall.c:87-104 first Update (flag 4 set): SpawnAsChild En_Wall_Tubo params=this params at target pos
            w.afterUpdates(a, 1, () => {
                // second wall picks target 1-3 with Rand_ZeroFloat(2.99f) (line 93); modelled as the upright target (index 1)
                const offs = a.params === 0 ? [0, 210, -20] : [0, 170, -20];
                const pos = [a.home.pos[0] + offs[0], a.home.pos[1] + offs[1], a.home.pos[2] + offs[2]];
                w.spawn("En_Wall_Tubo", a.params, "bowling wall target", { parent: a, home: { pos, rot: [0, 0, 0] } });
            });
        },
        Bg_Dy_Yoseizo(w, a) {
            // z_bg_dy_yoseizo.c:102-127 no heap effect in 1.2 (magic kills are < NTSC_1_1 only; SkelAnime_InitFlex uses instance tables)
        },
        Bg_Ganon_Otyuka(w, a) {
            // z_bg_ganon_otyuka.c:150 no heap effect (kill only after falling, line 297)
        },
        Bg_Gate_Shutter(w, a) {
            // z_bg_gate_shutter.c:57 no heap effect (INFTABLE_76/master sword only moves the gate)
        },
        Bg_Gjyo_Bridge(w, a) {
            // z_bg_gjyo_bridge.c:62 no heap effect (bridge flag only toggles draw/collision; cutscene needs Link position + items)
        },
        Bg_Gnd_Darkmeiro(w, a) {
            // z_bg_gnd_darkmeiro.c:54 no heap effect (block timer type sets/unsets switch params>>8&0x3F in Init, line 96-100)
        },
        Bg_Gnd_Firemeiro(w, a) {
            // z_bg_gnd_firemeiro.c:42 no heap effect
        },
        Bg_Gnd_Iceblock(w, a) {
            // z_bg_gnd_iceblock.c:58 no heap effect (params picked from x position; other positions ASSERT)
        },
        Bg_Gnd_Nisekabe(w, a) {
            // z_bg_gnd_nisekabe.c:32 no heap effect
        },
        Bg_Gnd_Soulmeiro(w, a) {
            // z_bg_gnd_soulmeiro.c:84-90 type 0 (params&0xFF) with switch (params>>8)&0x3F set: spawn Mir_Ray 9 at own pos, then kill
            if ((a.params & 0xff) === 0 && w.switchSet((a.params >> 8) & 0x3f)) {
                w.spawn("Mir_Ray", 0x0009, "light ray (web already burnt)", { home: { pos: a.home.pos.slice(), rot: [0, 0, 0] } });
                return w.kill(a, "switch flag set (web already burnt)");
            }
        },
        Bg_Haka_Gate(w, a) {
            // z_bg_haka_gate.c:83 no heap effect (switch/random skull-of-truth choice only picks states)
        },
        Bg_Haka_Huta(w, a) {
            // z_bg_haka_huta.c:65 no heap effect on load (En_Firefly/En_Rd spawn only when switch becomes set later, line 120)
        },
        Bg_Haka_Megane(w, a) {
            // z_bg_haka_megane.c:74-84 killed if OBJECT_HAKACH_OBJECTS (params<3) / OBJECT_HAKA_OBJECTS not in object list; objectSlot switched once loaded
        },
        Bg_Haka_MeganeBG(w, a) {
            // z_bg_haka_meganebg.c:72 no heap effect (switch (params>>8)&0xFF only picks gate state)
        },
        Bg_Haka_Sgami(w, a) {
            // z_bg_haka_sgami.c:177-193 two Effect_Add BLURE1 (static effect table, no arena); killed if OBJECT_HAKA_OBJECTS / OBJECT_ICE_OBJECTS not in object list
        },
        Bg_Haka_Ship(w, a) {
            // z_bg_haka_ship.c:74-79 params&0xFF == 0 spawns Bg_Haka_Ship params 1 (child platform) as child at pos + (-10, 82, 0)
            if ((a.params & 0xff) !== 0) return;
            const pos = [a.home.pos[0] - 10, a.home.pos[1] + 82, a.home.pos[2]];
            if (!w.spawn("Bg_Haka_Ship", 0x0001, "ship child platform", { parent: a, home: { pos, rot: [0, 0, 0] } })) w.kill(a, "child spawn failed");
        },
        Bg_Haka_Trap(w, a) {
            // z_bg_haka_trap.c:140 no heap effect (Effect_Ss_Dead_Db/kill only when spiked wall is burnt, line 327)
        },
        Bg_Haka_Tubo(w, a) {
            // z_bg_haka_tubo.c:92 no heap effect on load (drops/En_Firefly only after pot is destroyed)
        },
        Bg_Haka_Water(w, a) {
            // z_bg_haka_water.c:50 no heap effect (switch params only sets water level)
        },
        Bg_Haka_Zou(w, a) {
            // z_bg_haka_zou.c:108-124 type=params&0xFF, switch=(params>>8)&0xFF; types 1,2 killed if switch set (bird statue 0 just starts toppled)
            const type = a.params & 0xff;
            if (type !== 3 && type !== 0 && w.switchSet((a.params >> 8) & 0xff)) return w.kill(a, "switch flag set (already destroyed)");
            // Also killed if OBJECT_HAKACH_OBJECTS (type 2) / OBJECT_HAKA_OBJECTS not in object list; objectSlot switched once loaded (line 165)
        },
        Bg_Heavy_Block(w, a) {
            // z_bg_heavy_block.c:112-140 ganon_tou forces type 4; type 1 (breakable) killed if switch (params>>8)&0x3F set
            if (w.sceneName !== "ganon_tou" && (a.params & 0xff) === 1 && w.switchSet((a.params >> 8) & 0x3f)) w.kill(a, "switch flag set (block already broken)");
        },
        Bg_Hidan_Dalm(w, a) {
            // z_bg_hidan_dalm.c:120-123 killed if switch (params>>8)&0xFF set
            if (w.switchSet((a.params >> 8) & 0xff)) w.kill(a, "switch flag set (totem already hammered)");
        },
        Bg_Hidan_Firewall(w, a) {
            // z_bg_hidan_firewall.c:68 no heap effect
        },
        Bg_Hidan_Fslift(w, a) {
            // z_bg_hidan_fslift.c:56-61 SpawnAsChild Obj_Hsblock params 2 at pos + (0, 40, -28); killed if that fails
            const pos = [a.home.pos[0], a.home.pos[1] + 40, a.home.pos[2] - 28];
            if (!w.spawn("Obj_Hsblock", 0x0002, "hookshot target on lift", { parent: a, home: { pos, rot: [0, 0, 0] } })) w.kill(a, "child spawn failed");
        },
        Bg_Hidan_Fwbig(w, a) {
            // z_bg_hidan_fwbig.c:94-106 moving wall (params>>8 != 0) killed unless Link z > 300 or z < -300 at Init
            if ((a.params >> 8) !== 0 && w.linkPos && !(w.linkPos[2] > 300) && !(w.linkPos[2] < -300)) w.kill(a, "Link between z -300..300");
        },
        Bg_Hidan_Hamstep(w, a) {
            // z_bg_hidan_hamstep.c:197-209 + 127-141 step 0 (params&0xFF) spawns 5 steps, each SpawnAsChild of the previous
            if ((a.params & 0xff) !== 0) return;
            const ang = (((a.home.rot[1] + 0x8000) << 16) >> 16) * Math.PI / 0x8000;
            const sin = Math.sin(ang), cos = Math.cos(ang);
            let step = a;
            for (let i = 0; i < 5; i++) {
                const d = i * 160 + 60;
                const pos = [a.home.pos[0] + d * sin, a.home.pos[1] - 100, a.home.pos[2] + d * cos];
                step = w.spawn("Bg_Hidan_Hamstep", ((i + 1) & 0xff) | (a.params & 0xff00), `hammer step ${i + 1}`, { parent: step, home: { pos, rot: a.home.rot.slice() } });
                if (!step) break;
            }
        },
        Bg_Hidan_Hrock(w, a) {
            // z_bg_hidan_hrock.c:125 no heap effect on load (room = -1 / kill only after being hammered, line 203-218)
        },
        Bg_Hidan_Kousi(w, a) {
            // z_bg_hidan_kousi.c:99 no heap effect (switch (params>>8)&0xFF only picks open state)
        },
        Bg_Hidan_Kowarerukabe(w, a) {
            // z_bg_hidan_kowarerukabe.c:133-145 type=params&0xFF > 2 killed; killed if switch (params>>8)&0x3F set
            if ((a.params & 0xff) > 2) return w.kill(a, "invalid type");
            if (w.switchSet((a.params >> 8) & 0x3f)) w.kill(a, "switch flag set (wall already bombed)");
        },
        Bg_Hidan_Rock(w, a) {
            // z_bg_hidan_rock.c:99 no heap effect (switch only picks pushed position)
        },
        Bg_Hidan_Rsekizou(w, a) {
            // z_bg_hidan_rsekizou.c:133 no heap effect
        },
        Bg_Hidan_Sekizou(w, a) {
            // z_bg_hidan_sekizou.c:160 no heap effect
        },
        Bg_Hidan_Sima(w, a) {
            // z_bg_hidan_sima.c:96 no heap effect
        },
        Bg_Hidan_Syoku(w, a) {
            // z_bg_hidan_syoku.c:42 no heap effect (room clear only starts lift when Link stands on it)
        },
        Bg_Ice_Objects(w, a) {
            // z_bg_ice_objects.c:52 no heap effect
        },
        Bg_Ice_Shelter(w, a) {
            // z_bg_ice_shelter.c:199-203 killed if switch params&0x3F set, unless no-switch bit (params>>6)&1 (King Zora ice)
            if (!((a.params >> 6) & 1) && w.switchSet(a.params & 0x3f)) w.kill(a, "switch flag set (ice already melted)");
        },
        Bg_Ice_Shutter(w, a) {
            // z_bg_ice_shutter.c:71-84 type=params&0xFF; type 1 killed if switch (params>>8)&0xFF set, other types if room clear flag set
            if ((a.params & 0xff) !== 1) {
                if (w.roomCleared(a.room)) w.kill(a, "room clear flag set");
            } else if (w.switchSet((a.params >> 8) & 0xff)) w.kill(a, "switch flag set");
        },
        Bg_Ice_Turara(w, a) {
            // z_bg_ice_turara.c:71 no heap effect on load (Effect_Ss_En_Ice/kill only after falling or being broken)
        },
        Bg_Ingate(w, a) {
            // z_bg_ingate.c:55-59 killed unless adult in Lon Lon Ranch; also killed if Epona obtained and cutsceneIndex != CS_INDEX_0 (layer 4)
            if (w.sceneName !== "spot20" || !w.flags.adult) return w.kill(a, "not Lon Lon Ranch or child Link");
            if (w.event("EVENTCHKINF_EPONA_OBTAINED") && w.layer !== 4) w.kill(a, "Epona obtained, not CS_INDEX_0");
        },
        Bg_Jya_1flift(w, a) {
            // z_bg_jya_1flift.c:110-123 static sIsSpawned: every copy after the first is killed; survivor sets room = -1 (Destroy clears sIsSpawned)
            const statics = w.overlayStatics(a);
            if (statics.sIsSpawned) return w.kill(a, "sIsSpawned already set");
            a.room = -1;
            statics.sIsSpawned = true;
        },
        Bg_Jya_Amishutter(w, a) {
            // z_bg_jya_amishutter.c:72 no heap effect
        },
        Bg_Jya_Bigmirror(w, a) {
            // z_bg_jya_bigmirror.c:186-195 static sIsSpawned guard; survivor sets room = -1 (Destroy clears sIsSpawned)
            const statics = w.overlayStatics(a);
            if (statics.sIsSpawned) return w.kill(a, "sIsSpawned already set");
            a.room = -1;
            statics.sIsSpawned = true;
            const inTopRoom = () => w.curRoom === 0x19 || w.curRoom === 0x1a;
            // z_bg_jya_bigmirror.c:203 Update (UPDATE_CULLING_DISABLED): HandleCobra (:82-95) spawns both cobras as children when Link is in room 0x19/0x1A
            w.afterUpdates(a, 1, () => {
                if (inTopRoom()) {
                    w.spawn("Bg_Jya_Cobra", 0xff01, "big mirror cobra 1", { parent: a, home: { pos: [-560, 1743, -310], rot: [0, 0x8000, 0] } });
                    w.spawn("Bg_Jya_Cobra", 0xff02, "big mirror cobra 2", { parent: a, home: { pos: [60, 1743, -310], rot: [0, 0xa000, 0] } });
                }
                // z_bg_jya_bigmirror.c:143-170 HandleMirRay: slot cached on Update 1, beams spawn from Update 2 once OBJECT_MIR_RAY is loaded; beam 0 needs both cobras solved (not on load)
                w.afterUpdates(a, 1, () => w.whenObjectsLoaded(a, ["OBJECT_MIR_RAY"], () => {
                    if (!inTopRoom()) return;
                    w.spawn("Mir_Ray", 0x0007, "big mirror light beam 1", { home: { pos: [-560, 1800, -310], rot: [0, 0, 0] } });
                    w.spawn("Mir_Ray", 0x0008, "big mirror light beam 2", { home: { pos: [60, 1800, -310], rot: [0, 0, 0] } });
                }));
            });
        },
        Bg_Jya_Block(w, a) {
            // z_bg_jya_block.c:56-58 killed unless child Link with switch params&0x3F set
            if (w.flags.adult || !w.switchSet(a.params & 0x3f)) w.kill(a, "adult or switch not set");
        },
        Bg_Jya_Bombchuiwa(w, a) {
            // z_bg_jya_bombchuiwa.c:96-97 switch params&0x3F already set: SpawnLightRay (:197) spawns Mir_Ray params 0 at own position
            if (w.switchSet(a.params & 0x3f)) w.spawn("Mir_Ray", 0x0000, "bombchu rock light ray", { home: { pos: a.home.pos.slice(), rot: [0, 0, 0] } });
        },
        Bg_Jya_Bombiwa(w, a) {
            // z_bg_jya_bombiwa.c:113-114 killed if switch params&0x3F set
            if (w.switchSet(a.params & 0x3f)) w.kill(a, "switch flag set (rock already bombed)");
        },
        Bg_Jya_Cobra(w, a) {
            // z_bg_jya_cobra.c:430-442 type=params&3; type 0 SpawnAsChild Mir_Ray params 6 (:156, y+57); types 1,2 room = -1
            const type = a.params & 3;
            if (type === 0) {
                const pos = a.home.pos.slice();
                pos[1] += 57;
                w.spawn("Mir_Ray", 0x0006, "cobra light ray", { parent: a, home: { pos, rot: [0, 0, 0] } });
            }
            if (type === 1 || type === 2) a.room = -1;
        },
        Bg_Jya_Goroiwa(w, a) {
            // z_bg_jya_goroiwa.c:105 no heap effect
        },
        Bg_Jya_Ironobj(w, a) {
            // z_bg_jya_ironobj.c:235 no heap effect (Bg_Jya_Haheniron/Kakera/heart drops only when hit by Iron Knuckle, :265-278)
        },
        Bg_Jya_Kanaami(w, a) {
            // z_bg_jya_kanaami.c:76 no heap effect (switch params&0x3F only picks open/closed state)
        },
        Bg_Jya_Lift(w, a) {
            // z_bg_jya_lift.c:66-80 static sIsSpawned guard; survivor sets room = -1 (Destroy clears sIsSpawned)
            const statics = w.overlayStatics(a);
            if (statics.sIsSpawned) return w.kill(a, "sIsSpawned already set");
            a.room = -1;
            statics.sIsSpawned = true;
            // z_bg_jya_lift.c:155-157 every Update (UPDATE_CULLING_DISABLED) kills it unless Link is in room 5 or 25
            w.afterUpdates(a, 1, () => {
                if (w.curRoom !== 5 && w.curRoom !== 25) {
                    w.kill(a, "curRoom not 5/25 (first Update)");
                    statics.sIsSpawned = false;
                }
            });
        },
        Bg_Jya_Megami(w, a) {
            // z_bg_jya_megami.c:178-179 killed if switch params&0x3F set
            if (w.switchSet(a.params & 0x3f)) w.kill(a, "switch flag set (statue face already broken)");
        },
        Bg_Jya_Zurerukabe(w, a) {
            // z_bg_jya_zurerukabe.c:124 no heap effect
        },
        Bg_Menkuri_Eye(w, a) {
            // z_bg_menkuri_eye.c:83-85 no heap effect (only resets static sNumEyesShot)
        },
        Bg_Menkuri_Kaiten(w, a) {
            // z_bg_menkuri_kaiten.c:38 no heap effect
        },
        Bg_Menkuri_Nisekabe(w, a) {
            // z_bg_menkuri_nisekabe.c:34 no heap effect
        },
        Bg_Mizu_Bwall(w, a) {
            // z_bg_mizu_bwall.c:185 no heap effect (switch (params>>8)&0x3F only disables collision; kills are collider-setup failures)
        },
        Bg_Mizu_Movebg(w, a) {
            // z_bg_mizu_movebg.c:177-191 type=(params>>12)&0xF; dragon statues (3-6) SpawnAsChild Obj_Hsblock params 2, killed if that fails
            const type = (a.params >> 12) & 0xf;
            if (type < 3 || type > 6) return;
            // statue height (:148-163) then offset (0,80,23) rotated by rot.y (:183-184)
            let dy = 0;
            if (type === 3) dy = w.switchSet(0x1c) || w.switchSet(0x1d) || !w.switchSet(0x1e) ? -115.2 : 0;
            else if (w.switchSet(a.params & 0x3f)) dy = 115.2;
            const yaw = (a.home.rot[1] / 0x8000) * Math.PI;
            const pos = [a.home.pos[0] + 23 * Math.sin(yaw), a.home.pos[1] + dy + 80, a.home.pos[2] + 23 * Math.cos(yaw)];
            const block = w.spawn("Obj_Hsblock", 0x0002, "dragon statue hookshot target", { parent: a, home: { pos, rot: a.home.rot.slice() } });
            if (!block) w.kill(a, "Obj_Hsblock spawn failed");
        },
        Bg_Mizu_Shutter(w, a) {
            // z_bg_mizu_shutter.c:58 no heap effect (may Flags_UnsetSwitch its own switch at :86)
        },
        Bg_Mizu_Uzu(w, a) {
            // z_bg_mizu_uzu.c:43 no heap effect
        },
        Bg_Mizu_Water(w, a) {
            // z_bg_mizu_water.c:108 no heap effect (type 0 rewrites water-level switches 0x1C-0x1E at :134-148)
        },
        Bg_Mori_Bigst(w, a) {
            // z_bg_mori_bigst.c:96-101 killed if OBJECT_MORI_TEX not in the scene object list (not modelled)
            // z_bg_mori_bigst.c:121-132 once OBJECT_MORI_TEX loads: room clear + Link y > 700 + switch (params>>8)&0x3F unset -> SpawnAsChild En_Test params 1 (:148)
            w.whenObjectsLoaded(a, ["OBJECT_MORI_TEX"], () => {
                if (w.roomCleared(a.room) && w.linkPos && w.linkPos[1] > 700 && !w.switchSet((a.params >> 8) & 0x3f)) {
                    w.spawn("En_Test", 0x0001, "second Stalfos (key ceiling)", { parent: a, home: { pos: [209, 827, -3320], rot: [0, 0, 0] } });
                }
            });
        },
        Bg_Mori_Elevator(w, a) {
            // z_bg_mori_elevator.c:115-128 static sIsSpawned: first copy sets room = -1, later copies killed (bank-danger kill is DEBUG only)
            const statics = w.overlayStatics(a);
            if (statics.sIsSpawned) return w.kill(a, "sIsSpawned already set");
            statics.sIsSpawned = true;
            a.room = -1;
        },
        Bg_Mori_Hashira4(w, a) {
            // z_bg_mori_hashira4.c:86-105 switch=(params>>8)&0x3F; gates (params&0xFF != 0) killed if switch set; OBJECT_MORI_TEX list check not modelled
            if ((a.params & 0xff) !== 0 && w.switchSet((a.params >> 8) & 0x3f)) w.kill(a, "gate switch set");
        },
        Bg_Mori_Hineri(w, a) {
            // z_bg_mori_hineri.c:77-117 hall type=(params&0x8000)>>14 (+1 if switch params&0x3F set); bit 0x4000 = twisting variant
            const twist = (a.params & 0x4000) !== 0;
            let type = (a.params & 0x8000) >> 14;
            if (w.switchSet(a.params & 0x3f)) type = type === 0 ? 1 : type === 2 ? 3 : type;
            // z_bg_mori_hineri.c:127-162,172-176 non-twisting type 1: once objects load, next Update spawns boss key chest En_Box 0x27EE
            if (type === 1 && !twist) {
                w.whenObjectsLoaded(a, ["OBJECT_MORI_HINERI1A", "OBJECT_MORI_TEX"], () => {
                    w.afterUpdates(a, 1, () => {
                        const pos = [a.home.pos[0] + 147, a.home.pos[1] - 245, a.home.pos[2] - 453];
                        w.spawn("En_Box", 0x27ee, "boss key chest", { home: { pos, rot: [0, 0x4000, 0] } });
                    });
                });
            }
        },
        Bg_Mori_Idomizu(w, a) {
            // z_bg_mori_idomizu.c:63-90 static sIsSpawned guard; survivor sets room = -1 (Destroy clears sIsSpawned)
            const statics = w.overlayStatics(a);
            if (statics.sIsSpawned) return w.kill(a, "sIsSpawned already set");
            statics.sIsSpawned = true;
            a.room = -1;
            // z_bg_mori_idomizu.c:104-155 Update after OBJECT_MORI_TEX loads -> Main next Update kills it unless Link is in room 7/8/9
            w.whenObjectsLoaded(a, ["OBJECT_MORI_TEX"], () => {
                w.afterUpdates(a, 1, () => {
                    if (w.curRoom !== 7 && w.curRoom !== 8 && w.curRoom !== 9) {
                        w.kill(a, "curRoom not 7/8/9");
                        statics.sIsSpawned = false;
                    }
                });
            });
        },
        Bg_Mori_Kaitenkabe(w, a) {
            // z_bg_mori_kaitenkabe.c:72-74 no heap effect (killed only if OBJECT_MORI_TEX not in scene object list)
        },
        Bg_Mori_Rakkatenjo(w, a) {
            // z_bg_mori_rakkatenjo.c:85-91 no heap effect (killed only if OBJECT_MORI_TEX not in scene object list)
        },
        Bg_Po_Event(w, a) {
            // z_bg_po_event.c:210-231 type=(params>>8)&0xF, index=(params>>12)&0xF, switch=params&0x3F; killed if switch set
            const type = (a.params >> 8) & 0xf;
            const index = (a.params >> 12) & 0xf;
            const sw = a.params & 0x3f;
            if (w.switchSet(sw)) return w.kill(a, "switch flag set (puzzle solved)");
            const childParams = ((index + 1) << 12) + (type << 8) + sw;
            if (type >= 2) {
                // z_bg_po_event.c:138-146 paintings (type 2/3, not 4): index 0 and 1 SpawnAsChild the next painting; killed if that fails
                if (type === 4 || index === 2) return;
                const px = [-1302, -866, 1421, 985], py = [1107, 1091], pz = [-3384, -3252];
                const phi = type === 2 ? index : index + 2;
                const pos = [px[phi], py[index], pz[index]];
                const child = w.spawn("Bg_Po_Event", childParams, `painting ${index + 1}`, { parent: a, home: { pos, rot: [0, (a.home.rot[1] + 0x8000) & 0xffff, 0] } });
                if (!child) w.kill(a, "painting spawn failed");
            } else {
                // z_bg_po_event.c:176-184 type 0 blocks: index 0-2 SpawnAsChild the next block; killed if that fails
                if (type !== 0 || index === 3) return;
                const bx = [2149, 1969, 1909], bz = [-1410, -1350, -1530];
                const pos = [bx[index], a.home.pos[1], bz[index]];
                const child = w.spawn("Bg_Po_Event", childParams, `block ${index + 1}`, { parent: a, home: { pos, rot: [0, a.home.rot[1], (a.home.rot[2] - 0x4000) & 0xffff] } });
                if (!child) w.kill(a, "block spawn failed");
            }
        },
        Bg_Po_Syokudai(w, a) {
            // z_bg_po_syokudai.c:109-120 flame=(params>>8)&0xFF, switch=params&0x3F; torch flags 0x1C+color
            const flame = (a.params >> 8) & 0xff;
            const sw = a.params & 0x3f;
            if (flame === 0 && w.switchSet(0x1f) && w.switchSet(0x1e) && w.switchSet(0x1d) && !w.switchSet(sw)) {
                w.spawn("En_Po_Sisters", sw, "Meg", { home: { pos: [119, 225, -1566], rot: [0, 0, 0] } });
            } else if (!w.switchSet(0x1c) && !w.switchSet(0x1b)) {
                const pos = a.home.pos.slice();
                pos[1] += 52;
                w.spawn("En_Po_Sisters", ((flame << 8) + sw + 0x1000) & 0xffff, "Poe sister at torch", { home: { pos, rot: [0, 0, 0] } });
            }
        },
        Bg_Relay_Objects(w, a) {
            // z_bg_relay_objects.c:57-114 function-static bitmask D_808A9508 (reset only on code reload); room = -1 for every type
            const statics = w.overlayStatics(a);
            const mask = statics.D_808A9508 || 0;
            const sw = a.params & 0x3f;
            const mode = (a.params >> 8) & 0xff;
            const room = a.room;
            a.room = -1;
            if (mode === 0) {
                // windmill gear: bit 2
                if (mask & 2) return w.kill(a, "windmill gear already spawned");
                statics.D_808A9508 = mask | 2;
                return;
            }
            // Dampe race door: id = switch-0x33 in room 0, else room+1
            const id = room === 0 ? sw - 0x33 : room + 1;
            if (id >= 6) {
                if (mask & 1) return w.kill(a, "door bit 1 already set");
                statics.D_808A9508 = mask | 1;
            } else if (id !== 5) {
                w.unsetSwitch(sw); // :101
                if (mask & (1 << id)) return w.kill(a, "door bit already set");
                statics.D_808A9508 = mask | (1 << id);
            } else {
                w.setSwitch(sw); // :109; always stays
                statics.D_808A9508 = mask | 1;
            }
        },
        Bg_Spot01_Idohashira(w, a) {
            // z_bg_spot01_idohashira.c:321-334 normal layers: killed if EVENTCHKINF_54 and adult; cutscene layers other than 4 and 6 killed
            if (w.layer < 4) {
                if (w.event("EVENTCHKINF_54") && w.flags.adult) w.kill(a, "EVENTCHKINF_54 and adult");
            } else if (w.layer !== 4 && w.layer !== 6) {
                w.kill(a, "cutscene layer not 4/6");
            }
        },
        Bg_Spot01_Idomizu(w, a) {
            // z_bg_spot01_idomizu.c:49 no heap effect (drained well / adult only sets water height)
        },
        Bg_Spot01_Idosoko(w, a) {
            // z_bg_spot01_idosoko.c:57-58 killed if child Link
            if (!w.flags.adult) w.kill(a, "child Link");
        },
        Bg_Spot01_Objects2(w, a) {
            // z_bg_spot01_objects2.c:56-79 object = MATOYAB for type 3 (params&7), else MATOYA; killed if not in scene object list (not modelled)
            if ((a.params & 7) !== 3) return;
            // z_bg_spot01_objects2.c:100-120 first Update after OBJECT_SPOT01_MATOYAB loads: by day SpawnAsChild En_Daiku_Kakariko ((params>>8)&0xFF)<<8|1 at path point 0
            w.whenObjectsLoaded(a, ["OBJECT_SPOT01_MATOYAB"], () => {
                if (!w.flags.night) w.spawn("En_Daiku_Kakariko", (((a.params >> 8) & 0xff) << 8) + 1, "carpenter Sabooro", { parent: a });
            });
        },
        Bg_Spot03_Taki(w, a) {
            // z_bg_spot03_taki.c:55 no heap effect
        },
        Bg_Spot05_Soko(w, a) {
            // z_bg_spot05_soko.c:56-73 params&0xFF 0: killed if adult; otherwise killed if switch (params>>8)&0xFF set
            if ((a.params & 0xff) === 0) {
                if (w.flags.adult) w.kill(a, "adult");
            } else if (w.switchSet((a.params >> 8) & 0xff)) {
                w.kill(a, "switch flag set");
            }
        },
        Bg_Spot06_Objects(w, a) {
            // z_bg_spot06_objects.c:114-197 type=(params>>8)&0xFF, switch=params&0xFF
            const type = (a.params >> 8) & 0xff;
            const sw = a.params & 0xff;
            if (type === 3 && !w.flags.adult) return w.kill(a, "ice block: child Link");
            // z_bg_spot06_objects.c:141-148,414-415 lock already pulled (adult + switch): LockFloat spawns Effect_Ss_G_Ripple every 7th frame; no UPDATE_CULLING_DISABLED so only once in view
            if (type === 1 && w.flags.adult && w.switchSet(sw)) w.afterUpdates(a, 1, () => w.effect("Effect_Ss_G_Ripple"));
        },
        Bg_Spot07_Taki(w, a) {
            // z_bg_spot07_taki.c:44 no heap effect
        },
        Bg_Spot08_Bakudankabe(w, a) {
            // z_bg_spot08_bakudankabe.c:174-176 killed if switch params&0x3F set
            if (w.switchSet(a.params & 0x3f)) w.kill(a, "switch flag set (wall already bombed)");
        },
        Bg_Spot08_Iceblock(w, a) {
            // z_bg_spot08_iceblock.c:74-95 CheckParams: low byte outside the valid set becomes params 0x10
            let p = a.params;
            if (![0x01, 0x04, 0x10, 0x11, 0x12, 0x14, 0x20, 0x23, 0x24].includes(p & 0xff)) p = 0x10;
            // z_bg_spot08_iceblock.c:325-328 killed if child Link
            if (!w.flags.adult) return w.kill(a, "child Link");
            // z_bg_spot08_iceblock.c:357-358,278-282 type 3 without bit 0x100 SpawnAsChild its twin floe (params 0x123) at home
            if ((p & 0xf) === 3 && !(p & 0x100)) {
                w.spawn("Bg_Spot08_Iceblock", 0x0123, "twin ice floe", { parent: a, home: { pos: a.home.pos.slice(), rot: a.home.rot.slice() } });
            }
        },
        Bg_Spot09_Obj(w, a) {
            // z_bg_spot09_obj.c:148-167 params&=0xFF; func_808B1AE0 (line 70-94) decides which Gerudo Valley bridge/tent piece exists
            const p = a.params & 0xff;
            let keep;
            if (w.layer >= 4) keep = p === 0;
            else if (w.flags.adult) {
                const rescued = w.event("EVENTCHKINF_CARPENTER_0_RESCUED") && w.event("EVENTCHKINF_CARPENTER_1_RESCUED") &&
                    w.event("EVENTCHKINF_CARPENTER_2_RESCUED") && w.event("EVENTCHKINF_CARPENTER_3_RESCUED");
                keep = p === 1 ? !rescued : p === 4 ? rescued : p === 3;
            } else keep = p === 2;
            if (!keep) w.kill(a, "wrong age / carpenter state / layer for this piece");
        },
        Bg_Spot11_Bakudankabe(w, a) {
            // z_bg_spot11_bakudankabe.c:125-128 killed if switch flag params&0x3F set
            if (w.switchSet(a.params & 0x3f)) w.kill(a, "switch flag set (wall already bombed)");
        },
        Bg_Spot11_Oasis(w, a) {
            // z_bg_spot11_oasis.c:99 no heap effect (En_Elf fairy spawner only after Song of Storms fills the oasis, line 126)
        },
        Bg_Spot12_Gate(w, a) {
            // z_bg_spot12_gate.c:74 no heap effect (switch params&0x3F only picks open/closed state)
        },
        Bg_Spot12_Saku(w, a) {
            // z_bg_spot12_saku.c:71 no heap effect (switch params&0x3F only picks open/closed state)
        },
        Bg_Spot15_Rrbox(w, a) {
            // z_bg_spot15_rrbox.c:136 no heap effect (switch params&0x3F only picks pushed position)
        },
        Bg_Spot15_Saku(w, a) {
            // z_bg_spot15_saku.c:41 no heap effect (INFTABLE_71 only moves the fence)
        },
        Bg_Spot16_Bombstone(w, a) {
            // z_bg_spot16_bombstone.c:252-287 type=params&0xFF, switch=(params>>8)&0x3F; boulder (0xFF) killed if switch set
            const type = a.params & 0xff;
            if (type === 0xff && w.switchSet((a.params >> 8) & 0x3f)) w.kill(a, "boulder already destroyed");
            // Debris types 0-5 are killed if OBJECT_BOMBIWA is not in the scene object list (line 239); retail keeps other types
        },
        Bg_Spot16_Doughnut(w, a) {
            // z_bg_spot16_doughnut.c:53 no heap effect
        },
        Bg_Spot17_Bakudankabe(w, a) {
            // z_bg_spot17_bakudankabe.c:110-113 killed if switch flag params&0x3F set
            if (w.switchSet(a.params & 0x3f)) w.kill(a, "switch flag set (wall already bombed)");
        },
        Bg_Spot17_Funen(w, a) {
            // z_bg_spot17_funen.c:43 no heap effect
        },
        Bg_Spot18_Basket(w, a) {
            // z_bg_spot18_basket.c:168-176 unless switch (params>>8)&0x3F is set, spawns its lid Bg_Spot18_Futa (params -1) as child
            if (w.switchSet((a.params >> 8) & 0x3f)) return;
            if (!w.spawn("Bg_Spot18_Futa", 0xffff, "Goron City vase lid", { parent: a })) w.kill(a, "lid spawn failed");
        },
        Bg_Spot18_Obj(w, a) {
            // z_bg_spot18_obj.c:113-131 D_808B90F0[params&0xF][age]: type 1 (statue spear) is removed for adult Link
            if ((a.params & 0xf) === 1 && w.flags.adult) w.kill(a, "adult (spear statue)");
        },
        Bg_Spot18_Shutter(w, a) {
            // z_bg_spot18_shutter.c:47 no heap effect (INFTABLE_109 / switch only pick open state)
        },
        Bg_Toki_Hikari(w, a) {
            // z_bg_toki_hikari.c:56-62 params 1 killed if EVENTCHKINF_OPENED_DOOR_OF_TIME
            if (a.params === 1 && w.event("EVENTCHKINF_OPENED_DOOR_OF_TIME")) w.kill(a, "Door of Time already opened");
        },
        Bg_Toki_Swd(w, a) {
            // z_bg_toki_swd.c:80 no heap effect
        },
        Bg_Zg(w, a) {
            // z_bg_zg.c:69-73,137-139 killed if switch flag (params>>8)&0xFF set
            if (w.switchSet((a.params >> 8) & 0xff)) w.kill(a, "switch flag set (bars open)");
        },
        Boss_Dodongo(w, a) {
            // z_boss_dodongo.c:225 SkelAnime_Init(NULL tables) -> 2x ZELDA_ARENA_MALLOC(49*6); freed by Destroy SkelAnime_Free
            w.allocateFor(a, 0x126, "Boss_Dodongo jointTable", false);
            w.allocateFor(a, 0x126, "Boss_Dodongo morphTable", false);
            // z_boss_dodongo.c:239-248 room clear: kill, blue warp as child, lava cover wall, heart container
            if (w.roomCleared(a.room)) {
                w.spawn("Door_Warp1", 0x0000, "blue warp (KD beaten)", { parent: a, home: { pos: [-890, -1523.76, -3304], rot: [0, 0, 0] } });
                w.spawn("Bg_Breakwall", 0x6000, "KD lava cover (KD beaten)", { home: { pos: [-890, -1523.76, -3304], rot: [0, 0, 0] } });
                w.spawn("Item_B_Heart", 0x0000, "heart container (KD beaten)", { home: { pos: [-690, -1523.76, -3304], rot: [0, 0, 0] } });
                return w.kill(a, "room clear flag set");
            }
        },
        Boss_Fd(w, a) {
            // z_boss_fd.c:201 Flags_SetSwitch(0x14) (temp switch)
            w.setSwitch(0x14);
            // z_boss_fd.c:202 Bg_Vb_Sima platform (params 100) as child
            w.spawn("Bg_Vb_Sima", 100, "Volvagia platform", { parent: a, home: { pos: [680, -100, 0], rot: [0, 0, 0] } });
            // z_boss_fd.c:206-208 3x SkelAnime_Init(NULL tables) -> 2x ZELDA_ARENA_MALLOC(7*6) each; freed by Destroy
            for (const part of ["head", "right arm", "left arm"]) {
                w.allocateFor(a, 0x2a, `Boss_Fd ${part} jointTable`, false);
                w.allocateFor(a, 0x2a, `Boss_Fd ${part} morphTable`, false);
            }
            // z_boss_fd.c:238-246 room clear: kill, blue warp (WARP_DUNGEON_ADULT) as child, heart; else Boss_Fd2 child params introState (BFD_CS_WAIT=1)
            if (w.roomCleared(a.room)) {
                w.spawn("Door_Warp1", 0xffff, "blue warp (Volvagia beaten)", { parent: a, home: { pos: [0, 100, 0], rot: [0, 0, 0] } });
                w.spawn("Item_B_Heart", 0x0000, "heart container (Volvagia beaten)", { home: { pos: [0, 100, 200], rot: [0, 0, 0] } });
                return w.kill(a, "room clear flag set");
            }
            w.spawn("Boss_Fd2", 0x0001, "Volvagia (hole form)", { parent: a });
        },
        Boss_Ganon(w, a) {
            // z_boss_ganon.c:383 params (s16) >= 0x64 are light balls / magic with no heap effect
            const p = (a.params << 16) >> 16;
            if (p >= 0x64) return;
            // z_boss_ganon.c:384 Flags_SetSwitch(0x14) (temp switch)
            w.setSwitch(0x14);
            // z_boss_ganon.c:396 SkelAnime_InitFlex(NULL tables) -> 2x ZELDA_ARENA_MALLOC(26*6); freed by Destroy
            w.allocateFor(a, 0x9c, "Boss_Ganon jointTable", false);
            w.allocateFor(a, 0x9c, "Boss_Ganon morphTable", false);
            if (p !== 1) {
                // z_boss_ganon.c:513-531,601-626 intro: first Update with OBJECT_GANON_ANIME2 loaded spawns Zelda (first time only) and the organ
                // (also killed if OBJECT_GANON_ANIME2 is not in the scene object list, line 517)
                w.whenObjectsLoaded(a, ["OBJECT_GANON_ANIME2"], () => {
                    if (!w.event("EVENTCHKINF_BEGAN_GANONDORF_BATTLE")) w.spawn("En_Zl3", 0x2000, "Zelda (Ganondorf intro)", { parent: a });
                    w.spawn("En_Ganon_Organ", 0x0001, "Ganondorf's organ", { parent: a });
                });
            } else {
                // z_boss_ganon.c:404-414 tower-collapse Ganondorf killed if switch 0x37 set in the boss/collapse scenes
                const collapseScene = ["ganon_demo", "ganon_final", "ganon_sonogo", "ganontikasonogo"].includes(w.sceneName);
                if (w.switchSet(0x37) && collapseScene) return w.kill(a, "switch 0x37 set in collapse scene");
                // z_boss_ganon.c:1218-1236,1548-1558 tower cutscene: first Update with OBJECT_GANON_ANIME2 loaded spawns Zelda as child
                w.whenObjectsLoaded(a, ["OBJECT_GANON_ANIME2"], () => {
                    w.spawn("En_Zl3", 0x2000, "Zelda (tower collapse start)", { parent: a });
                });
            }
            // z_boss_ganon.c:419-421 cape as child, then Actor_ChangeCategory(BOSS)
            w.spawn("En_Ganon_Mant", 0x0001, "Ganondorf cape", { parent: a });
            w.changeCategory(a, 9); // ACTORCAT_BOSS
        },
        Boss_Ganon2(w, a) {
            // z_boss_ganon2.c:464 SkelAnime_InitFlex(NULL tables) -> 2x ZELDA_ARENA_MALLOC(26*6); freed by Destroy
            w.allocateFor(a, 0x9c, "Boss_Ganon2 jointTable", false);
            w.allocateFor(a, 0x9c, "Boss_Ganon2 morphTable", false);
            // z_boss_ganon2.c:508-521 first Update with OBJECT_GANON_ANIME3 loaded spawns Zelda (params 1) as child
            w.whenObjectsLoaded(a, ["OBJECT_GANON_ANIME3"], () => {
                w.spawn("En_Zl3", 0x0001, "Zelda (Ganon fight)", { parent: a });
            });
        },
        Boss_Ganondrof(w, a) {
            // z_boss_ganondrof.c:306 SkelAnime_Init(NULL tables) -> 2x ZELDA_ARENA_MALLOC(26*6); freed by Destroy
            w.allocateFor(a, 0x9c, "Boss_Ganondrof jointTable", false);
            w.allocateFor(a, 0x9c, "Boss_Ganondrof morphTable", false);
            // z_boss_ganondrof.c:307-308 params (s16) < GND_FAKE_BOSS (10) become GND_REAL_BOSS (1)
            let p = (a.params << 16) >> 16;
            if (p < 10) p = 1;
            // z_boss_ganondrof.c:323-332 room clear: kill, blue warp (not child), heart; else En_Fhg (horse) child with params
            if (w.roomCleared(a.room)) {
                w.spawn("Door_Warp1", 0xffff, "blue warp (Phantom Ganon beaten)", { home: { pos: [14, -33, -3315], rot: [0, 0, 0] } });
                w.spawn("Item_B_Heart", 0x0000, "heart container (Phantom Ganon beaten)", { home: { pos: [214, -33, -3315], rot: [0, 0, 0] } });
                return w.kill(a, "room clear flag set");
            }
            w.spawn("En_fHG", p & 0xffff, "Phantom Ganon's horse", { parent: a });
        },
        Boss_Mo(w, a) {
            // z_boss_mo.c:370 tentacle (params 100) has no heap effect
            if (a.params === 100) return;
            // z_boss_mo.c:371 Flags_SetSwitch(0x14) (temp switch)
            w.setSwitch(0x14);
            // z_boss_mo.c:389-397 room clear: kill, blue warp (WARP_DUNGEON_ADULT) as child, heart
            if (w.roomCleared(a.room)) {
                w.spawn("Door_Warp1", 0xffff, "blue warp (Morpha beaten)", { parent: a, home: { pos: [0, -280, 0], rot: [0, 0, 0] } });
                w.spawn("Item_B_Heart", 0x0000, "heart container (Morpha beaten)", { home: { pos: [-200, -280, 0], rot: [0, 0, 0] } });
                return w.kill(a, "room clear flag set");
            }
            // z_boss_mo.c:408-413 first tentacle as child, then Actor_ChangeCategory(BOSS)
            w.spawn("Boss_Mo", 100, "Morpha tentacle", { parent: a });
            w.changeCategory(a, 9); // ACTORCAT_BOSS
        },
        Boss_Sst(w, a) {
            // z_boss_sst.c:301 Flags_SetSwitch(0x14) (temp switch); skeletons use instance tables (no arena)
            w.setSwitch(0x14);
            if (a.params !== 0xffff) return; // hands (0/1): no heap effect
            // z_boss_sst.c:303-304 head spawns Bg_Sst_Floor (BONGOFLOOR_REST), not as child
            w.spawn("Bg_Sst_Floor", 0x0000, "Bongo Bongo drum", { home: { pos: [-50, 0, 0], rot: [0, 0, 0] } });
            // z_boss_sst.c:316-321 room clear: blue warp, heart, kill
            if (w.roomCleared(a.room)) {
                w.spawn("Door_Warp1", 0xffff, "blue warp (Bongo Bongo beaten)", { home: { pos: [-50, 0, 400], rot: [0, 0, 0] } });
                w.spawn("Item_B_Heart", 0x0000, "heart container (Bongo Bongo beaten)", { home: { pos: [-50, 0, -200], rot: [0, 0, 0] } });
                return w.kill(a, "room clear flag set");
            }
            // z_boss_sst.c:323-338 left and right hands (not children), then Actor_ChangeCategory(BOSS)
            w.spawn("Boss_Sst", 0x0000, "Bongo Bongo left hand", { home: { pos: [200, 0, -250], rot: [0, 0, 0] } });
            w.spawn("Boss_Sst", 0x0001, "Bongo Bongo right hand", { home: { pos: [-200, 0, -250], rot: [0, 0, 0] } });
            w.changeCategory(a, 9); // ACTORCAT_BOSS
        },
        Boss_Tw(w, a) {
            // z_boss_tw.c:483 params (s16) >= TW_FIRE_BLAST (0x64) are blasts with no heap effect
            const p = (a.params << 16) >> 16;
            if (p >= 0x64) return;
            if (p === 0 || p === 1) {
                // z_boss_tw.c:542,560 Kotake/Koume SkelAnime_InitFlex(NULL tables) -> 2x ZELDA_ARENA_MALLOC(27*6); freed by Destroy
                const who = p === 0 ? "Kotake" : "Koume";
                w.allocateFor(a, 0xa2, `Boss_Tw ${who} jointTable`, false);
                w.allocateFor(a, 0xa2, `Boss_Tw ${who} morphTable`, false);
                return;
            }
            // z_boss_tw.c:581 Twinrova SkelAnime_InitFlex(NULL tables) -> 2x ZELDA_ARENA_MALLOC(44*6); freed by Destroy
            w.allocateFor(a, 0x108, "Boss_Tw Twinrova jointTable", false);
            w.allocateFor(a, 0x108, "Boss_Tw Twinrova morphTable", false);
            // z_boss_tw.c:597-612 room clear: kill, blue warp (WARP_DUNGEON_ADULT) as child, heart; else Kotake and Koume as children
            if (w.roomCleared(a.room)) {
                w.spawn("Door_Warp1", 0xffff, "blue warp (Twinrova beaten)", { parent: a, home: { pos: [600, 230, 0], rot: [0, 0, 0] } });
                w.spawn("Item_B_Heart", 0x0000, "heart container (Twinrova beaten)", { home: { pos: [-600, 230, 0], rot: [0, 0, 0] } });
                return w.kill(a, "room clear flag set");
            }
            w.spawn("Boss_Tw", 0x0000, "Kotake", { parent: a });
            w.spawn("Boss_Tw", 0x0001, "Koume", { parent: a });
        },
        Boss_Va(w, a) {
            // z_boss_va.c:612-642 skeleton per part, all with NULL tables -> 2x ZELDA_ARENA_MALLOC(limbCount*6); freed by Destroy
            const p = (a.params << 16) >> 16;
            let size = 0;
            if (p === -1) size = 0x180; // body, 64 limbs
            else if (p >= 0 && p <= 2) size = 0x4e; // supports, 13 limbs
            else if (p >= 3 && p <= 5) size = 0x30; // zappers, 8 limbs
            else if (p >= 16 && p <= 18) size = 0x36; // stumps, 9 limbs
            else if (p !== 19) size = 0x1e; // default: Bari, 5 limbs (flex skeleton read as normal)
            if (size) {
                w.allocateFor(a, size, `Boss_Va p${p} jointTable`, false);
                w.allocateFor(a, size, `Boss_Va p${p} morphTable`, false);
            }
            if (p !== -1) return;
            // z_boss_va.c:650 door (BOSSVA_DOOR 19) as child
            w.spawn("Boss_Va", 19, "Barinade door", { parent: a });
            // z_boss_va.c:652-663 room clear: En_Ru1 (or Door_Warp1 if EVENTCHKINF_37) params 0, heart, kill
            if (w.roomCleared(a.room)) {
                w.spawn(w.event("EVENTCHKINF_37") ? "Door_Warp1" : "En_Ru1", 0x0000, "Barinade beaten: warp / Ruto");
                w.spawn("Item_B_Heart", 0x0000, "heart container (Barinade beaten)");
                return w.kill(a, "room clear flag set");
            }
            // z_boss_va.c:688-695 if battle already begun: 10 Bari (15 down to 6) as children
            if (w.event("EVENTCHKINF_BEGAN_BARINADE_BATTLE")) {
                for (let i = 15; i >= 6; i--) w.spawn("Boss_Va", i, `Bari ${i}`, { parent: a });
            }
            // z_boss_va.c:708-714 zappers and supports (5 down to 0) as children
            for (let i = 5; i >= 0; i--) w.spawn("Boss_Va", i, i >= 3 ? `Barinade zapper ${i}` : `Barinade support ${i}`, { parent: a });
        },
        Demo_6K(w, a) {
            // z_demo_6k.c:85-209 WaitForObject (line 216) runs on first Update, the type's action from the next one
            const p = (a.params << 16) >> 16;
            if (p === 2) {
                // z_demo_6k.c:262-265 16th action run (timer1 == 15) spawns Eff_Dust EFF_DUST_TYPE_1 as child
                w.whenObjectsLoaded(a, ["OBJECT_DEMO_6K"], () => w.afterUpdates(a, 16, () => w.spawn("Eff_Dust", 0x0001, "light ball dust", { parent: a })));
            } else if (p === 9 || p === 10) {
                // z_demo_6k.c:396-399 killed on 48th action run (timer2 > 47)
                w.afterUpdates(a, 49, () => w.kill(a, "fire ball timer"));
            } else if (p === 11) {
                // z_demo_6k.c:444-458 Effect_Ss_KiraKira from 5th action run, killed on 25th (timer2 > 24)
                w.afterUpdates(a, 6, () => {
                    w.effect("Effect_Ss_KiraKira");
                    w.afterUpdates(a, 20, () => w.kill(a, "vanish timer"));
                });
            } else if (p === 12) {
                // z_demo_6k.c:168 Actor_ChangeCategory(ITEMACTION)
                w.changeCategory(a, 7); // ACTORCAT_ITEMACTION
                // z_demo_6k.c:555-565 first action run after OBJECT_GND_MAGIC loads spawns Demo_6K 13; killed on 61st run
                w.whenObjectsLoaded(a, ["OBJECT_GND_MAGIC"], () => w.afterUpdates(a, 1, () => {
                    w.spawn("Demo_6K", 13, "Ganondorf magic ball");
                    w.afterUpdates(a, 60, () => w.kill(a, "timer2 > 60"));
                }));
            } else if (p === 13) {
                // z_demo_6k.c:172,535-540 action set in Init; on 105th run (timer2 > 104) spawns 150 Effect_Ss_KiraKira and is killed
                w.afterUpdates(a, 105, () => {
                    w.effect("Effect_Ss_KiraKira");
                    w.kill(a, "timer2 > 104");
                });
            }
            // Other types wait for cutscene cues
        },
        Demo_Du(w, a) {
            // z_demo_du.c:986-1007 every type SkelAnime_InitFlex(gDaruniaSkel, NULL tables) -> 2x ZELDA_ARENA_MALLOC(18*6); freed by Destroy
            w.allocateFor(a, 0x6c, "Demo_Du jointTable", false);
            w.allocateFor(a, 0x6c, "Demo_Du morphTable", false);
            // Door_Warp1 / Demo_Effect / Demo_6K spawns are cutscene-cue driven only
        },
        Demo_Ec(w, a) {
            // z_demo_ec.c:171-174 killed if params (s16) outside 0..34
            const p = (a.params << 16) >> 16;
            if (p < 0 || p > 34) return w.kill(a, "invalid params");
            // z_demo_ec.c:1273-1303 first Update with draw+anim objects loaded runs the type init -> SkelAnime_InitFlex(NULL tables)
            // (line 228) -> 2x ZELDA_ARENA_MALLOC(limbCount*6); killed if either object is not in the scene object list (line 1290)
            const draw = ["OBJECT_IN", "OBJECT_TA", "OBJECT_FU", "OBJECT_KM1", "OBJECT_KW1", "OBJECT_BJI", "OBJECT_AHG", "OBJECT_BOB", "OBJECT_BBA",
                "OBJECT_TORYO", "OBJECT_DAIKU", "OBJECT_DAIKU", "OBJECT_DAIKU", "OBJECT_DAIKU", "OBJECT_KM1", "OBJECT_KW1", "OBJECT_GE1", "OBJECT_GE1",
                "OBJECT_GE1", "OBJECT_ZO", "OBJECT_KZ", "OBJECT_MD", "OBJECT_NIW", "OBJECT_NIW", "OBJECT_NIW", "OBJECT_ANE", "OBJECT_DS2", "OBJECT_OS",
                "OBJECT_FISH", "OBJECT_RS", "OBJECT_OF1D_MAP", "OBJECT_OF1D_MAP", "OBJECT_OF1D_MAP", "OBJECT_OF1D_MAP", "OBJECT_MA2"];
            const sizes = [0x78, 0x66, 0x60, 0x60, 0x60, 0x60, 0x60, 0x60, 0x60, 0x66, 0x66, 0x66, 0x66, 0x66, 0x60, 0x60, 0x60, 0x60,
                0x60, 0x78, 0x48, 0x66, 0x60, 0x60, 0x60, 0x60, 0x36, 0x36, 0x36, 0x36, 0x6c, 0x6c, 0x6c, 0x6c, 0x72];
            const anim = p === 33 ? "OBJECT_GM" : p === 34 ? "OBJECT_MA2" : "OBJECT_EC";
            w.whenObjectsLoaded(a, [draw[p], anim], () => {
                w.allocateFor(a, sizes[p], `Demo_Ec p${p} jointTable`, false);
                w.allocateFor(a, sizes[p], `Demo_Ec p${p} morphTable`, false);
            });
        },
        Demo_Ext(w, a) {
            // z_demo_ext.c:43 no heap effect (vortex kills itself only after cutscene cues)
        },
        Demo_Geff(w, a) {
            // z_demo_geff.c:74-79 killed if params (s16) outside 0..8
            const p = (a.params << 16) >> 16;
            if (p < 0 || p >= 9) w.kill(a, "invalid params");
            // Also killed on first Update if its object is not in the scene object list (line 213)
        },
        Demo_Gj(w, a) {
            // z_demo_gj.c:1391-1443 type=params&0xFF; valid types killed in cutscene layers (DemoGj_InitSetIndices, line 277-285)
            const type = a.params & 0xff;
            if (![4, 8, 9, 10, 11, 12, 13, 14, 16, 17, 22].includes(type)) return w.kill(a, "invalid type");
            if (w.layer >= 4) w.kill(a, "cutscene layer");
        },
        Demo_Go(w, a) {
            // z_demo_go.c:347 SkelAnime_InitFlex(gGoronSkel, NULL tables) -> 2x ZELDA_ARENA_MALLOC(18*6); freed by Destroy
            w.allocateFor(a, 0x6c, "Demo_Go jointTable", false);
            w.allocateFor(a, 0x6c, "Demo_Go morphTable", false);
        },
        Demo_Gt(w, a) {
            // z_demo_gt.c:1748-1781 valid params 0,1,2,5,6,7,23,24; killed unless in a cutscene layer (func_8097EE44, line 485-495)
            if (![0, 1, 2, 5, 6, 7, 23, 24].includes(a.params)) return w.kill(a, "invalid params");
            if (!(w.layer >= 4)) w.kill(a, "not a cutscene layer");
            // Bg_Spot16_Doughnut cloud rings and dust/Kakera effects are spawned at fixed cutscene frames only
        },
        Demo_Ik(w, a) {
            // z_demo_ik.c:520 no heap effect (skeletons use instance tables)
        },
        Demo_Kekkai(w, a) {
            // z_demo_kekkai.c:79-89,134-139 killed if params (s16) outside 0..6 or its barrier event flag is set
            const p = (a.params << 16) >> 16;
            const flags = ["EVENTCHKINF_C3", "EVENTCHKINF_BC", "EVENTCHKINF_BF", "EVENTCHKINF_BE", "EVENTCHKINF_BD", "EVENTCHKINF_AD", "EVENTCHKINF_BB"];
            if (p < 0 || p > 6) return w.kill(a, "invalid params");
            if (w.event(flags[p])) w.kill(a, "barrier already dispelled");
        },
        Demo_Sa(w, a) {
            // z_demo_sa.c:812-833 every type SkelAnime_InitFlex(gSariaSkel, NULL tables) -> 2x ZELDA_ARENA_MALLOC(17*6); freed by Destroy
            w.allocateFor(a, 0x66, "Demo_Sa jointTable", false);
            w.allocateFor(a, 0x66, "Demo_Sa morphTable", false);
            // z_demo_sa.c:661 bridge type (5) spawns her fairy En_Elf FAIRY_KOKIRI (3) as child
            if (a.params === 5) w.spawn("En_Elf", 0x0003, "Saria's fairy", { parent: a });
        },
        Demo_Shd(w, a) {
            // z_demo_shd.c:43 no heap effect
        },
        Door_Gerudo(w, a) {
            // z_door_gerudo.c:49 no heap effect (switch params&0x3F only picks open state)
        },
        Door_Killer(w, a) {
            // z_door_killer.c:137-164 door type (params&0xFF == 0) killed if switch (params>>8)&0x3F (0x3F none) set; skeleton uses instance table
            const flag = (a.params >> 8) & 0x3f;
            if ((a.params & 0xff) === 0 && flag !== 0x3f && w.switchSet(flag)) w.kill(a, "switch flag set");
        },
        Efc_Erupc(w, a) {
            // z_efc_erupc.c:45 no heap effect (particles live in the instance)
        },
        En_Ani(w, a) {
            // z_en_ani.c:82 no heap effect (skeleton uses instance tables)
        },
        // z_en_anubice_tag.c:40-68 Init only picks range; first Update (FLAGS 4, always updates) SpawnAsChild En_Anubice params 0
        En_Anubice_Tag(w, a) {
            const pos = a.home ? a.home.pos.slice() : [0, 0, 0];
            w.afterUpdates(a, 1, () => w.spawn("En_Anubice", 0x0000, "anubis (tag)", { parent: a, home: { pos, rot: [0, 0, 0] } }));
        },
        // z_en_ba.c:122-129 type = params & 0xFF; tentacles (type < 3) killed if switch (params >> 8) & 0xFF set
        En_Ba(w, a) {
            const type = a.params & 0xff;
            if (type < 3 && w.switchSet((a.params >> 8) & 0xff)) w.kill(a, "switch flag set (tentacle beaten)");
            // type >= 3 (EN_BA_DEAD_BLOB) only comes from a dying tentacle (z_en_ba.c:411); kills itself after landing (:227)
        },
        En_Bb(w, a) {
            // z_en_bb.c:341-416 bit 7 sign-extends params (|= 0xFF00); upper byte 0 = flame trail piece; -1 blue, -2 red, -3 white, -4 green, -5 big green
            let p = a.params & 0xffff;
            if (p & 0x80) p |= 0xff00;
            if (!(p & 0xff00)) return; // flame trail piece: no heap effect
            const type = (p << 16) >> 16;
            if (type === -2) {
                // z_en_bb.c:806-816 red Bubble (FLAGS 4) jumps out when Link is within 250 and in front: EnBb_SpawnFlameTrail spawns 5 En_Bb params 0 (:288)
                w.afterUpdates(a, 1, () => {
                    if (!w.near(a, 250)) return;
                    for (let i = 0; i < 5; i++) w.spawn("En_Bb", 0x0000, `red bubble flame trail ${i + 1}`, { home: a.home ? { pos: a.home.pos.slice(), rot: [0, 0, 0] } : undefined });
                });
            }
            // white Bubble Effect_Add(EFFECT_BLURE1) (:392) uses the static effect table, not the arena
        },
        En_Bili(w, a) {
            // z_en_bili.c:124-141 no heap effect (lightning/bubble effects only after being hit or killed)
        },
        En_Blkobj(w, a) {
            // z_en_blkobj.c:71 room clear flag = Dark Link beaten; else Wait (:91) -> SpawnDarkLink (:97) spawns En_Torch2 params 0 when xz < 120
            if (w.roomCleared(a.room)) return;
            const pos = a.home ? a.home.pos.slice() : [0, 0, 0];
            // SpawnDarkLink also needs the actor outside the culling volume (off screen); modelled as proximity only
            w.afterUpdates(a, 2, () => { if (w.near(a, 120)) w.spawn("En_Torch2", 0x0000, "Dark Link", { home: { pos, rot: [0, 0, 0] } }); });
        },
        // z_en_bom_bowl_man.c:92-100 spawns 2 En_Syateki_Niw params 1 (SYATEKI_MINIGAME_ALLEY) at fixed positions
        En_Bom_Bowl_Man(w, a) {
            w.spawn("En_Syateki_Niw", 0x0001, "bowling alley cucco 1", { home: { pos: [60, -60, -430], rot: [0, 0, 0] } });
            w.spawn("En_Syateki_Niw", 0x0001, "bowling alley cucco 2", { home: { pos: [0, -120, -620], rot: [0, 0, 0] } });
        },
        En_Brob(w, a) {
            // z_en_brob.c:68-105 no heap effect (lightning only in Shock after being hit, :258)
        },
        En_Bubble(w, a) {
            // z_en_bubble.c:344-362 no heap effect
        },
        En_Bw(w, a) {
            // z_en_bw.c:147-174 no heap effect (static sSlugGroup counter only; dust rings only in combat)
        },
        // z_en_bx.c:115-117 killed if switch (params >> 8) & 0xFF set
        En_Bx(w, a) {
            if (w.switchSet((a.params >> 8) & 0xff)) w.kill(a, "switch flag set");
            // lightning (Effect_Ss_Lightning, :196) only when Link comes within 70 xz or touches it
        },
        En_Changer(w, a) {
            // z_en_changer.c:76-211 Treasure Box Shop chest pairs; room = play->roomCtx.curRoom.num
            const room = w.curRoom;
            let m = room - 1;
            if (m < 0) m = 0;
            const opened = w.chestOpened([0x0, 0x2, 0x4, 0x6, 0x8, 0xa][Math.min(m, 5)]); // sTreasureFlags[m] (:91)
            m *= 2;
            const hp = w.itemGetInf("ITEMGETINF_1B");
            if (room >= 6) {
                // :108-130 final room: En_Box child at (20,20,-2500); if already opened kill, else Item_Etcetera heart piece / purple rupee
                const reward = 0x0a | (hp ? 0x4ea0 : 0x4ec0);
                const chest = w.spawn("En_Box", reward, "chest game final chest", { parent: a, home: { pos: [20, 20, -2500], rot: [0, 0x7fff, 0] } });
                if (chest) {
                    if (opened) return w.kill(a, "final room chest already opened"); // also Flags_SetTreasure(0x0A)
                    w.spawn("Item_Etcetera", (0x0a << 8) + (hp ? 0x0b : 0x0c), "chest game final item", { home: { pos: [20, 20, -2500], rot: [0, 0, 0] } });
                    return;
                }
            }
            // :134-154 key chest vs loser chest, swapped left/right with probability 1/2 (modelled unswapped)
            const loserGi = [0x00, 0x72, 0x72, 0x73, 0x73, 0x74][room] || 0;
            const loserEtc = [0x00, 0x08, 0x08, 0x09, 0x09, 0x0a][room] || 0;
            const leftPos = [[0, 0, 0], [-100, 20, -245], [-100, 20, -685], [-100, 20, -1125], [-100, 20, -1565], [-100, 20, -2005]][room] || [0, 0, 0];
            const rightPos = [[0, 0, 0], [140, 20, -245], [140, 20, -685], [140, 20, -1125], [140, 20, -1565], [140, 20, -2005]][room] || [0, 0, 0];
            const left = w.spawn("En_Box", ((loserGi << 5) | 0x4000 | m) & 0xffff, "chest game left chest", { parent: a, home: { pos: leftPos.slice(), rot: [0, 0xc001, 0] } });
            if (left && !opened) w.spawn("Item_Etcetera", ((m & 0x1f) << 8) + (loserEtc & 0xff), "chest game left item", { home: { pos: leftPos.slice(), rot: [0, 0, 0] } });
            const right = w.spawn("En_Box", (m | 0x4e21) & 0xffff, "chest game right chest", { parent: a, home: { pos: rightPos.slice(), rot: [0, 0x3fff, 0] } });
            if (right) {
                if (opened) return w.kill(a, "room chests already opened"); // :198-201 also Flags_SetTreasure on both chest flags
                w.spawn("Item_Etcetera", (((m | 1) & 0x1f) << 8) + 0x0d, "chest game right item (key)", { home: { pos: rightPos.slice(), rot: [0, 0, 0] } });
            }
        },
        En_Crow(w, a) {
            // z_en_crow.c:122-134 no heap effect (resets static sDeathCount only)
        },
        En_Daiku(w, a) {
            // z_en_daiku.c:174-199 type = params & 3; rescued carpenters leave the hideout, unrescued ones are absent from the tent
            const type = a.params & 3;
            const rescued = w.event(["EVENTCHKINF_CARPENTER_0_RESCUED", "EVENTCHKINF_CARPENTER_1_RESCUED", "EVENTCHKINF_CARPENTER_2_RESCUED", "EVENTCHKINF_CARPENTER_3_RESCUED"][type]);
            if (rescued && w.sceneName === "gerudoway") return w.kill(a, "carpenter already rescued");
            if (!rescued && w.sceneName === "tent") return w.kill(a, "carpenter not rescued yet");
            // En_Ge3 spawn (:517) only after the rescue escape run
        },
        En_Daiku_Kakariko(w, a) {
            // z_en_daiku_kakariko.c:152-173 child only: Kakariko by day, Guest House by night, Kakariko Potion Shop always
            let ok = false;
            if (!w.flags.adult) {
                if (w.sceneName === "spot01") ok = !w.flags.night;
                else if (w.sceneName === "kakariko") ok = w.flags.night;
                else if (w.sceneName === "drag") ok = true;
            }
            if (!ok) w.kill(a, "not this age/scene/time");
        },
        En_Dh(w, a) {
            // z_en_dh.c:167-185 no heap effect (rises with Effect_Ss_Hahen only once a hand grabs Link or a bomb hits it, :230)
        },
        En_Dha(w, a) {
            // z_en_dha.c:169-187 no heap effect
        },
        En_Diving_Game(w, a) {
            // z_en_diving_game.c:105-118 room = -1; static sIsInitialized (never cleared) kills every later copy while the code stays loaded
            a.room = -1;
            const statics = w.overlayStatics(a);
            if (statics.sIsInitialized) return w.kill(a, "sIsInitialized already set (duplicate)");
            statics.sIsInitialized = true;
            w.effect("Effect_Ss_G_Ripple"); // z_en_diving_game.c:540-544 every Update where gameplayFrames % 16 == 0 (FLAGS 4)
        },
        // z_en_dnt_demo.c:95-117 9 En_Dnt_Nomal (params 1..9) and En_Dnt_Jiji params 0, all as children
        En_Dnt_Demo(w, a) {
            const pos = [[3810, -20, 1010], [3890, -20, 990], [3730, -20, 950], [3840, -20, 930], [3910, -20, 870], [3780, -20, 860], [3710, -20, 840], [3860, -20, 790], [3750, -20, 750]];
            for (let i = 0; i < 9; i++) w.spawn("En_Dnt_Nomal", i + 1, `mask stage scrub ${i + 1}`, { parent: a, home: { pos: pos[i], rot: [0, 0, 0] } });
            w.spawn("En_Dnt_Jiji", 0x0000, "mask stage leader", { parent: a, home: { pos: [4050, -20, 1000], rot: [0, 0, 0] } });
        },
        En_Dnt_Nomal(w, a) {
            // z_en_dnt_nomal.c:140-179 killed if OBJECT_HINTNUTS (type 0) / OBJECT_DNK (type >= 1) is not in the scene object list; objectSlot switched once loaded (:195)
            // stage scrubs pop up / throw nuts / drop rupees only after mask judging; target scrub only reacts to slingshot hits
        },
        En_Dog(w, a) {
            // z_en_dog.c:259-296 dog index = (params >> 8) & 0xF (+1 unless bit 15 = following Link)
            let p = a.params & 0xffff;
            const following = (p & 0x8000) !== 0;
            if (!following) p = ((p & ~0x0f00) | ((((p >> 8) & 0xf) + 1) << 8)) & 0xffff;
            const idx = (p >> 8) & 0xf;
            // gSaveContext.dogParams / dogIsLost are not in the flag API: w.flags.dogParams (default 0), w.flags.dogIsLost (default true)
            const dogParams = w.flags.dogParams || 0;
            const dogIsLost = w.flags.dogIsLost !== false;
            if (((dogParams & 0x0f00) >> 8) === idx && !following) return w.kill(a, "this dog is already following Link");
            if (w.sceneName === "market_night" && !dogIsLost && idx === 1) return w.kill(a, "Richard already returned");
            if (w.sceneName === "impa" && !following && dogIsLost) return w.kill(a, "Richard is lost");
        },
        En_Ds(w, a) {
            // z_en_ds.c:41-58 no heap effect
        },
        En_Du(w, a) {
            // z_en_du.c:297 SkelAnime_InitFlex with NULL tables: 2x ZELDA_ARENA_MALLOC(18 limbs * 6 = 0x6C), before the kill check; Destroy frees them (SkelAnime_Free)
            const t1 = w.allocate(0x6c, "En_Du jointTable", false);
            const t2 = w.allocate(0x6c, "En_Du morphTable", false);
            a.arenaAllocs = [t1, t2].filter(Boolean); // freed on delete by EnDu_Destroy; see NOTES
            // z_en_du.c:169-176 Darunia only in Goron City as child, or Fire Temple as adult before INFTABLE_11A
            const ok = (w.sceneName === "spot18" && !w.flags.adult) || (w.sceneName === "hidan" && !w.inf("INFTABLE_11A") && w.flags.adult);
            if (!ok) w.kill(a, "func_809FDDB4 false");
        },
        En_Eg(w, a) {
            // z_en_eg.c:54-58 no heap effect (voids Link out once switch 0x36 is set and the sub timer runs out)
        },
        En_Eiyer(w, a) {
            // z_en_eiyer.c:147-178 params < 3 SpawnAsChild the next clone (params + 1); params 0 kills the whole chain unless 3 clones exist
            const p = (a.params << 16) >> 16;
            if (p >= 3) return;
            const home = a.home ? { pos: a.home.pos.slice(), rot: [0, (a.home.rot[1] + 0x4000) & 0xffff, 0] } : undefined;
            const child = w.spawn("En_Eiyer", (p + 1) & 0xffff, `stinger clone ${p + 1}`, { parent: a, home });
            a.eiyerChild = child;
            if (!child) return w.kill(a, "clone spawn failed");
            if (p === 0) {
                let n = 0;
                for (let c = a.eiyerChild; n !== 3; n++) {
                    if (!c) break;
                    c = c.eiyerChild;
                }
                if (n !== 3) for (let c = a; c; c = c.eiyerChild) w.kill(c, "stinger clones missing");
            }
        },
        En_Elf(w, a) {
            // z_en_elf.c:337-434 by params; LightContext_InsertLight x2 uses the light pool, not the arena
            const p = a.params;
            if (p === 0) {
                a.room = -1; // FAIRY_NAVI (:364)
            } else if (p === 2 || p === 7) {
                // FAIRY_HEAL_TIMED / FAIRY_HEAL_BIG: disappearTimer 240, shrinks 10 frames, Actor_Kill on the 250th Update (:672-681) unless caught/touched first
                w.afterUpdates(a, 250, () => w.kill(a, "timed healing fairy disappeared"));
            } else if (p === 3) {
                // FAIRY_KOKIRI: func_80A0353C kills it on the first Update when it has no live parent (:655); only a scene-placed one has none
                if (a.entry !== undefined) w.afterUpdates(a, 1, () => w.kill(a, "Kokiri fairy without parent"));
            } else if (p === 4) {
                // FAIRY_SPAWNER (:426-429) spawns 8 FAIRY_HEAL (params 6) 30 units below itself
                const pos = a.home ? [a.home.pos[0], a.home.pos[1] - 30, a.home.pos[2]] : [0, -30, 0];
                for (let i = 0; i < 8; i++) w.spawn("En_Elf", 0x0006, `fountain fairy ${i + 1}`, { home: { pos: pos.slice(), rot: [0, 0, 0] } });
            }
            // 1/5 (revive from bottle/death) kill themselves after their Link-relative flight (:706/:749); 6 stays until caught; others: ASSERT only (actionFunc left NULL)
        },
        En_Encount2(w, a) {
            // z_en_encount2.c:55-66 Death Mountain Trail copy killed for adult after the Fire Temple blue warp (EVENTCHKINF_49)
            const dmt = w.sceneName === "spot16";
            if (dmt && w.flags.adult && w.event("EVENTCHKINF_49")) return w.kill(a, "adult, Fire Temple done");
            // :84-97 Wait (FLAGS 4) activates by Link position; SpawnRocks (:141) spawns En_Fire_Rock children every 4 (DMT) / 50 (collapse) frames
            const lp = w.linkPos;
            const pos = lp ? [lp[0], lp[1] + 400, lp[2]] : [0, 0, 0];
            if (dmt) {
                if (!(lp && lp[1] > 1500 && lp[0] > -700 && lp[0] < 100 && lp[2] < -1290 && lp[2] > -3600)) return;
                const type = w.flags.adult ? 3 : 0; // child: 50% FIRE_ROCK_SPAWNED_FALLING1 (0), else FALLING2 (3)
                w.afterUpdates(a, 2, () => {
                    for (let i = 0; i < 2; i++) w.spawn("En_Fire_Rock", type, `DMT falling rock ${i + 1}`, { parent: a, home: { pos: pos.slice(), rot: [0, 0, 0] } });
                });
            } else if (["ganon_demo", "ganon_final", "ganon_sonogo", "ganontikasonogo"].includes(w.sceneName)) {
                if (!(w.switchSet(0x37) && w.near(a, 700))) return;
                w.afterUpdates(a, 2, () => w.spawn("En_Fire_Rock", 0x0003, "collapse falling rock", { parent: a, home: { pos: pos.slice(), rot: [0, 0, 0] } }));
            }
        },
        En_Fd(w, a) {
            // z_en_fd.c:472-488 no Init heap effect; Reappear -> SpinAndSpawnFire (:564) spawns 8 En_Fd_Fire children after a random spin time; see NOTES
        },
        En_Fire_Rock(w, a) {
            // z_en_fire_rock.c:92-160 type = params
            const type = a.params;
            if (type === 5) {
                // FIRE_ROCK_CEILING_SPOT_SPAWNER (:291-305): xz < 200 spawns FIRE_ROCK_SPAWNED_FALLING2 10 units above itself
                const pos = a.home ? [a.home.pos[0], a.home.pos[1] + 10, a.home.pos[2]] : [0, 10, 0];
                w.afterUpdates(a, 1, () => {
                    const lp = w.linkPos;
                    if (lp && Math.hypot(lp[0] - pos[0], lp[2] - pos[2]) < 200) w.spawn("En_Fire_Rock", 0x0003, "ceiling falling rock", { home: { pos, rot: [0, 0, 0] } });
                });
            } else if (type === 6) {
                w.changeCategory(a, 6); // ACTORCAT_PROP (:115)
                w.effect("Effect_Ss_En_Fire"); // FireRock_WaitOnFloor (:311) first Update (timer2 starts 0)
            } else if (type === 0 || type === 3) {
                w.effect("Effect_Ss_En_Fire"); // EnFireRock_Fall (:204) every falling frame
            } else if (type !== 1 && type !== 2) {
                w.kill(a, "no such rock type"); // :155-158
            }
        },
        En_Fish(w, a) {
            // z_en_fish.c:152-172 no heap effect (dropped fish, params 0, kills itself on timers after Link releases it)
        },
        En_Floormas(w, a) {
            // z_en_floormas.c:149-187 bit 15 = invisible; params 0x10 = small (waits hidden); a big one spawns 2 small ones (invisible bit copied)
            const invisible = a.params & 0x8000;
            const p = a.params & 0x7fff;
            if (p === 0x10) return;
            const home = () => (a.home ? { pos: a.home.pos.slice(), rot: [0, 0, 0] } : undefined);
            const s1 = w.spawn("En_Floormas", invisible + 0x10, "small floormaster 1", { home: home() });
            if (!s1) return w.kill(a, "small floormaster spawn failed");
            const s2 = w.spawn("En_Floormas", invisible + 0x10, "small floormaster 2", { home: home() });
            if (!s2) {
                w.kill(s1, "second small floormaster spawn failed");
                return w.kill(a, "second small floormaster spawn failed");
            }
        },
        En_Fr(w, a) {
            // z_en_fr.c:261-287 params 0 (ocarina spot manager) -> ACTORCAT_PROP; frogs 1-5 killed if OBJECT_GAMEPLAY_FIELD_KEEP is not in the scene object list
            if (a.params === 0) w.changeCategory(a, 6); // ACTORCAT_PROP
            // frogs only jump out (Effect_Ss_G_Splash, :378) once Link plays the ocarina on the log
        },
        En_Fu(w, a) {
            // z_en_fu.c:89-111 no heap effect
        },
        En_Fz(w, a) {
            // z_en_fz.c:173-218 no heap effect (ice smoke is the actor's own particle array)
        },
        En_G_Switch(w, a) {
            // z_en_g_switch.c:105-186 type = (params >> 12) & 0xF, switch flag = params & 0x3F
            const type = (a.params >> 12) & 0xf;
            const flag = a.params & 0x3f;
            if (type === 0) {
                // ENGSWITCH_SILVER_TRACKER: resets static sCollectedCount; silverCount = (params >> 6) & 0x3F
                w.overlayStatics(a).sCollectedCount = 0;
                if (w.switchSet(flag)) return w.kill(a, "switch flag set");
                // :240-254 first Update kills it (and sets the switch / GTG room 2 temp clear) when sCollectedCount >= silverCount, i.e. silverCount 0
                if (((a.params >> 6) & 0x3f) === 0) w.afterUpdates(a, 1, () => w.kill(a, "silverCount 0"));
            } else if (type === 1) {
                if (w.switchSet(flag)) w.kill(a, "switch flag set (silver rupee collected)");
            } else if (type === 2) {
                // ENGSWITCH_ARCHERY_POT: killed if OBJECT_TSUBO is not in the scene object list (:164); objectSlot switched once loaded
            }
        },
        En_Gb(w, a) {
            // z_en_gb.c:167-234 no heap effect (light pool light, own caged-soul array)
        },
        En_Ge1(w, a) {
            // z_en_ge1.c:122-188 type = params & 0xFF; 5 valley floor gone for adult, 0x45 horseback archery gone without a bow
            const type = a.params & 0xff;
            if (type === 0x05 && w.flags.adult) return w.kill(a, "valley floor Gerudo: adult");
            if (type === 0x45 && !w.hasItem("ITEM_BOW")) return w.kill(a, "horseback archery Gerudo: no bow");
        },
        En_Ge2(w, a) {
            // z_en_ge2.c:129-185 no heap effect
        },
        En_GeldB(w, a) {
            // z_en_geldb.c:250-277 key collectible flag = (params >> 8) & 0xFF (0 = none)
            const keyFlag = (a.params >> 8) & 0xff;
            if (keyFlag !== 0 && w.collected(keyFlag)) return w.kill(a, "key collectible flag set");
            // :381-400 Wait (FLAGS 4) drops once switch home.rot.z is set and Link is within 300 xz; landing spawns 2 floor dust rings
            if (a.home && w.switchSet(a.home.rot[2]) && w.near(a, 300)) w.effect("Effect_Ss_Dust");
        },
        En_Gm(w, a) {
            // z_en_gm.c:79-97 no heap effect (waits for OBJECT_GM, tables are in the instance)
        },
        En_Go2(w, a) {
            // z_en_go2.c:1574-1645 type = params & 0x1F
            const type = a.params & 0x1f;
            if (type >= 0x07 && type <= 0x0b && !w.hasQuest("QUEST_MEDALLION_FIRE") && w.flags.adult) return w.kill(a, "Goron City Goron: adult before Fire Medallion");
            if (type === 0x0d && (w.flags.adult || !w.hasQuest("QUEST_GORON_RUBY"))) return w.kill(a, "Bazaar Goron: adult or no Goron Ruby");
            if (type === 0x03 && w.switchSet((a.params >> 10) & 0x3f)) return w.kill(a, "Fire Temple Goron already freed");
            // type 5 (DMT rolling) rolls once Link is within 1000 and drops an En_Bom at its path end (:1383); see NOTES
        },
        // z_en_guest.c:76-78 killed if INFTABLE_76; else waits for OBJECT_OS_ANIME (no allocation)
        En_Guest(w, a) {
            if (w.inf("INFTABLE_76")) w.kill(a, "INFTABLE_76 set");
        },
        En_Hata(w, a) {
            // z_en_hata.c:68 SkelAnime_Init with NULL tables: 2x ZELDA_ARENA_MALLOC(21 limbs * 6 = 0x7E); Destroy frees them (SkelAnime_Free)
            const t1 = w.allocate(0x7e, "En_Hata jointTable", false);
            const t2 = w.allocate(0x7e, "En_Hata morphTable", false);
            a.arenaAllocs = [t1, t2].filter(Boolean); // freed on delete by EnHata_Destroy; see NOTES
        },
        En_Heishi1(w, a) {
            // z_en_heishi1.c:85 type=(params>>8)&0xFF, path=params&0xFF; path 3 spawns 8 En_Ex_Ruppy (params 3) as children at absolute sRupeePositions (:128-135)
            const type = (a.params >> 8) & 0xff;
            if ((a.params & 0xff) === 3) {
                const pos = [[0, 0, 90], [-55, 0, 90], [-55, 0, 30], [-55, 0, -30], [0, 0, -30], [55, 0, -30], [55, 0, 30], [55, 0, 90]];
                pos.forEach((p, i) => w.spawn("En_Ex_Ruppy", 3, `guard rupee ${i + 1}`, { parent: a, home: { pos: p, rot: [0, 0, 0] } }));
            }
            // z_en_heishi1.c:138-152 CLOCK_TIME(17,18)-1 = 0xB888; falls back to the night flag without an exact dayTime
            const t = w.dayTime;
            const fled = w.event("EVENTCHKINF_ZELDA_FLED_CASTLE");
            if (type !== 5) {
                const early = t !== undefined ? t < 0xb888 : !w.flags.night;
                if (!((early || !w.flags.night) && !fled)) w.kill(a, "day guard: evening/night or Zelda fled");
            } else {
                const late = t !== undefined ? t > 0xb888 : w.flags.night;
                if (!(late || w.flags.night || fled)) w.kill(a, "night guard (type 5): daytime and Zelda not fled");
            }
        },
        En_Heishi2(w, a) {
            // z_en_heishi2.c:106-110 types 6 and 9 (params&0xFF) become ACTORCAT_PROP; type 9's En_Bom (:679) only after its textbox is advanced
            const type = a.params & 0xff;
            if (type === 6 || type === 9) w.changeCategory(a, 6); // PROP
        },
        En_Heishi3(w, a) {
            // z_en_heishi3.c:72 no heap effect (only picks guard type from params/position)
        },
        En_Heishi4(w, a) {
            // z_en_heishi4.c:68 Init no kill; FLAGS lacks UPDATE_CULLING_DISABLED, so the first Update (the kills below) only runs once it is in view
            const type = a.params & 0xff;
            if (type === 8) {
                // HEISHI4_AT_MARKET_NIGHT: func_80A56544 z_en_heishi4.c:185-188 killed if not child
                w.afterUpdates(a, 2, () => { if (w.flags.adult) w.kill(a, "market night guard: adult"); });
            } else if (type === 7) {
                // HEISHI4_AT_MARKET_DYING: func_80A5673C z_en_heishi4.c:232-256 killed if Master Sword obtained or Zelda not fled
                w.afterUpdates(a, 2, () => {
                    if (w.event("EVENTCHKINF_OBTAINED_MASTER_SWORD")) return w.kill(a, "dying guard: Master Sword obtained");
                    if (!w.event("EVENTCHKINF_ZELDA_FLED_CASTLE")) w.kill(a, "dying guard: Zelda not fled");
                });
            }
        },
        En_Honotrap(w, a) {
            // z_en_honotrap.c:221-222 HONOTRAP_TYPE_FLAME_DROP (2) belongs to no room; eye (0) spawns a flame child only when Link is close/below/in front (:279)
            if (a.params === 2) a.room = -1;
        },
        En_Horse(w, a) {
            // z_en_horse.c:771 Init; bit 15 = HNI (Ingo's horse, killed if OBJECT_HNI not in the object list :792); params 0x7FFF -> 1
            const hni = !!(a.params & 0x8000);
            let p = hni ? a.params & 0x7fff : a.params;
            if (p === 0x7fff) p = 1;
            const rz = (a.home.rot[2] << 16) >> 16;
            const epona = w.event("EVENTCHKINF_EPONA_OBTAINED");
            // z_en_horse.c:853-879 Lon Lon Ranch (not cutscene layer) and stable kills
            if (w.sceneName === "spot20" && !(w.layer >= 4)) {
                if (hni) {
                    if (rz === 0 || w.flags.night) return w.kill(a, "LLR HNI: rot.z 0 or night");
                    if (epona) return w.kill(a, "LLR HNI: Epona obtained");
                    if (rz !== 5) return w.kill(a, "LLR HNI: rot.z != 5");
                } else if (!epona && w.flags.night) return w.kill(a, "LLR Epona: night before Epona obtained");
            } else if (w.sceneName === "malon_stable") {
                if (!w.flags.night || epona || !w.flags.adult) return w.kill(a, "stable: day, Epona obtained or child");
            }
            // z_en_horse.c:883 Skin_Init: gEponaSkel 47 limbs/374 vtx, gHorseIngoSkel 47 limbs/305 vtx (freed by Skin_Free in Destroy)
            const vtx = hni ? 305 : 374;
            w.allocateFor(a, 47 * 0xc, "En_Horse skin vtxTable", false);
            w.allocateFor(a, vtx * 0x10, "En_Horse skin vtx buf 0", false);
            w.allocateFor(a, vtx * 0x10, "En_Horse skin vtx buf 1", false);
            w.allocateFor(a, 48 * 6, "En_Horse jointTable", false);
            w.allocateFor(a, 48 * 6, "En_Horse morphTable", false);
            // z_en_horse.c:896-899 HORSE_PTYPE_INGO_SPAWNED_RIDING spawns Ingo (En_In params 1, rot.z 1) riding it
            if (p === 3) w.spawn("En_In", 1, "Ingo riding", { home: { pos: a.home.pos.slice(), rot: [a.home.rot[0], a.home.rot[1], 1] } });
        },
        En_Horse_Game_Check(w, a) {
            // z_en_horse_game_check.c:453-463 LLR with Epona obtained forces MALON_RACE (4); INGO_RACE (1) spawns Ingo's horse (:104)
            const type = w.sceneName === "spot20" && w.event("EVENTCHKINF_EPONA_OBTAINED") ? 4 : a.params;
            if (type === 1) w.spawn("En_Horse", 0x8003, "Ingo's race horse", { home: { pos: [-250, 1, -1650], rot: [0, 0x4000, 0] } });
        },
        En_Horse_Link_Child(w, a) {
            // z_en_horse_link_child.c:168 Skin_Init gChildEponaSkel (46 limbs, 406 vtx) before the kill check (freed by Skin_Free in Destroy)
            w.allocateFor(a, 46 * 0xc, "child Epona skin vtxTable", false);
            w.allocateFor(a, 406 * 0x10, "child Epona skin vtx buf 0", false);
            w.allocateFor(a, 406 * 0x10, "child Epona skin vtx buf 1", false);
            w.allocateFor(a, 47 * 6, "child Epona jointTable", false);
            w.allocateFor(a, 47 * 6, "child Epona morphTable", false);
            // z_en_horse_link_child.c:179-184 LLR (not cutscene layer) killed until Talon returned
            if (!(w.layer >= 4) && w.sceneName === "spot20" && !w.event("EVENTCHKINF_TALON_RETURNED_FROM_CASTLE")) w.kill(a, "Talon not returned");
        },
        En_Horse_Normal(w, a) {
            // z_en_horse_normal.c:200 Init; kills :220-241 (LLR by rot.z/age/flags), :254-256 (stable by day); Skin_Init gHorseNormalSkel 46 limbs/358 vtx
            const rz = (a.home.rot[2] << 16) >> 16;
            if (w.sceneName === "spot20") {
                if (rz === 0 || w.flags.night) return w.kill(a, "LLR: rot.z 0 or night");
                if (!w.flags.adult) {
                    if (w.event("EVENTCHKINF_TALON_RETURNED_FROM_CASTLE") ? rz !== 3 : rz !== 1) return w.kill(a, "LLR child: rot.z variant");
                } else if (w.event("EVENTCHKINF_EPONA_OBTAINED") ? rz !== 7 : rz !== 5) return w.kill(a, "LLR adult: rot.z variant");
            } else if (w.sceneName === "malon_stable" && !w.flags.night) {
                return w.kill(a, "stable: day");
            }
            w.allocateFor(a, 46 * 0xc, "En_Horse_Normal skin vtxTable", false);
            w.allocateFor(a, 358 * 0x10, "En_Horse_Normal skin vtx buf 0", false);
            w.allocateFor(a, 358 * 0x10, "En_Horse_Normal skin vtx buf 1", false);
            w.allocateFor(a, 47 * 6, "En_Horse_Normal jointTable", false);
            w.allocateFor(a, 47 * 6, "En_Horse_Normal morphTable", false);
        },
        En_Hs(w, a) {
            // z_en_hs.c:83-96 adult carpenter's son (chicken shop) killed once ITEMGETINF_30 is set
            if (w.flags.adult && w.itemGetInf("ITEMGETINF_30")) w.kill(a, "adult: ITEMGETINF_30");
        },
        En_Hs2(w, a) {
            // z_en_hs2.c:63 no heap effect
        },
        En_Hy(w, a) {
            // z_en_hy.c:1148 Init; type=params&0x7F (>=21 killed); EnHy_ShouldSpawn z_en_hy.c:1070; also killed if its OS_ANIME/skel/head objects are missing
            const type = a.params & 0x7f;
            if (type >= 21) return w.kill(a, "invalid ENHY_TYPE");
            const adult = w.flags.adult, night = w.flags.night;
            let ok = true;
            switch (w.sceneName) {
                case "spot01": // SCENE_KAKARIKO_VILLAGE
                    if ([9, 10, 12, 2, 7].includes(type) && adult && type !== 12 && night) ok = false;
                    break;
                case "labo": // SCENE_IMPAS_HOUSE
                    if (type === 10 && (!adult || !night)) ok = false;
                    break;
                case "impa": // SCENE_DOG_LADY_HOUSE
                    if (type === 0 && !night) ok = false;
                    break;
                case "kakariko": // SCENE_KAKARIKO_CENTER_GUEST_HOUSE
                    if (type === 0) ok = adult;
                    else if ([9, 2, 7].includes(type)) ok = night && adult;
                    break;
                case "market_alley":
                case "market_alley_n": // SCENE_BACK_ALLEY_DAY/NIGHT
                    if (type === 14 && (night || (w.event("EVENTCHKINF_ZELDA_FLED_CASTLE") && !w.event("EVENTCHKINF_OBTAINED_MASTER_SWORD")))) ok = false;
                    break;
                default:
                    if ((type === 19 || type === 20) && adult) ok = false;
            }
            if (!ok) w.kill(a, "EnHy_ShouldSpawn false");
            // z_en_hy.c:1172 EnHy_WaitForObjects: SkelAnime_InitFlex into instance tables; every type 0-20 has an action, so no later kill
        },
        En_Ice_Hono(w, a) {
            // z_en_ice_hono.c:167 no heap effect (light node is not arena; dropped flame (0) spawns 8+10 En_Ice_Hono only on landing, :258/:309)
        },
        En_Ik(w, a) {
            // z_en_ik.c:1552 Init; switch flags >= 0x20 read tempSwch with the shift masked to 5 bits (MIPS sllv)
            const sw = (f) => w.switchSet(f < 0x20 ? f : 0x20 | (f & 0x1f));
            const type = a.params & 0xff, upper = a.params & 0xff00;
            if ((type === 0 && w.event("EVENTCHKINF_DEFEATED_NABOORU_KNUCKLE")) || (upper !== 0 && sw(upper >> 8))) return w.kill(a, "Nabooru knuckle beaten or switch set");
            // EnIk_InitImpl z_en_ik.c:241-249 non-Nabooru armor becomes ACTORCAT_ENEMY
            if (type !== 0) w.changeCategory(a, 5); // ENEMY
            // z_en_ik.c:265 Effect_Add BLURE1 uses the static effect table (no arena); kills :267-274
            const flag = upper >> 8;
            if (flag !== 0xff) {
                if (sw(flag)) w.kill(a, "switch flag set");
            } else if (type !== 0 && w.roomCleared(a.room)) {
                w.kill(a, "room clear flag set");
            }
        },
        En_In(w, a) {
            // z_en_in.c:514 Init (killed if params > 0 and OBJECT_IN missing); first Update EnIn_WaitForObject z_en_in.c:545 (UPDATE_CULLING_DISABLED)
            w.afterUpdates(a, 1, () => {
                const adult = w.flags.adult, day = !w.flags.night, rz = (a.home.rot[2] << 16) >> 16;
                const talon = w.event("EVENTCHKINF_TALON_RETURNED_FROM_CASTLE"), epona = w.event("EVENTCHKINF_EPONA_OBTAINED");
                if (a.params === 1 && rz === 1 && adult) return; // EnIn_StartingRace z_en_in.c:388
                // EnIn_GetStartMode z_en_in.c:400
                let mode = "null";
                if (w.sceneName === "spot20" && !adult && day && rz === 1 && !talon) mode = "working";
                else if (w.sceneName === "malon_stable" && !adult && day && rz === 3 && talon) mode = "working";
                else if (w.sceneName === "malon_stable" && !adult && !day && ((rz === 2 && !talon) || (rz === 4 && talon))) mode = "working";
                else if (w.sceneName === "spot20" && adult && day && rz === 5 && !epona) mode = "running";
                else if (w.sceneName === "spot20" && adult && day && rz === 7 && epona) mode = "obedient";
                else if (w.sceneName === "souko" && adult && !day && ((rz === 6 && !epona) || (rz === 8 && epona))) mode = "sleeping";
                if (mode === "null") return w.kill(a, "ENIN_START_MODE_NULL");
                // z_en_in.c:580-608 running-ranch Ingo stays only for the matching EVENTINF race state; state 0 (OFFER_RENTAL) keeps params 2
                if (mode === "running" && a.params !== 2) w.kill(a, "running ranch: race state (assumed 0) does not match params");
            });
        },
        En_Jj(w, a) {
            // z_en_jj.c:100-120 JABUJABU_MAIN (-1) spawns its body collision (En_Jj params 0) as child at x-10
            if (a.params === 0xffff) {
                const [x, y, z] = a.home.pos;
                w.spawn("En_Jj", 0x0000, "Jabu-Jabu body collision", { parent: a, home: { pos: [x - 10, y, z], rot: [0, a.home.rot[1], 0] } });
            }
        },
        En_Js(w, a) {
            // z_en_js.c:79 carpet merchant always spawns his carpet (En_Jsjutan params 0) as child
            w.spawn("En_Jsjutan", 0x0000, "carpet", { parent: a, home: { pos: a.home.pos.slice(), rot: [0, 0, 0] } });
        },
        En_Kakasi(w, a) {
            // z_en_kakasi.c:89 SkelAnime_InitFlex(NULL tables) -> 2x ZELDA_ARENA_MALLOC(28*6); never freed (Destroy lacks SkelAnime_Free, :77)
            w.allocate(0xa8, "En_Kakasi jointTable", false);
            w.allocate(0xa8, "En_Kakasi morphTable", false);
        },
        En_Kakasi3(w, a) {
            // z_en_kakasi3.c:93 SkelAnime_InitFlex(NULL tables) -> 2x ZELDA_ARENA_MALLOC(28*6); never freed (Destroy lacks SkelAnime_Free, :81)
            w.allocate(0xa8, "En_Kakasi3 jointTable", false);
            w.allocate(0xa8, "En_Kakasi3 morphTable", false);
        },
        En_Kz(w, a) {
            // z_en_kz.c:407-411 adult King Zora without INFTABLE_138 spawns his ice (Bg_Ice_Shelter 0x04FF) as child (pos may be moved to path end :404)
            if (w.flags.adult && !w.inf("INFTABLE_138")) w.spawn("Bg_Ice_Shelter", 0x04ff, "King Zora ice", { parent: a, home: { pos: a.home.pos.slice(), rot: [0, 0, 0] } });
        },
        En_Light(w, a) {
            // z_en_light.c:59 no heap effect (light node is in the light context, not the arena)
        },
        En_Ma1(w, a) {
            // z_en_ma1.c:276 SkelAnime_InitFlex(NULL tables) gMalonChildSkel 18 limbs -> 2x ZELDA_ARENA_MALLOC(19*6) before the kill (freed by SkelAnime_Free)
            w.allocateFor(a, 0x72, "En_Ma1 jointTable", false);
            w.allocateFor(a, 0x72, "En_Ma1 morphTable", false);
            // EnMa1_ShouldSpawn z_en_ma1.c:182-219
            const rz = (a.home.rot[2] << 16) >> 16, talon = w.event("EVENTCHKINF_TALON_RETURNED_FROM_CASTLE");
            let ok = false;
            if (rz === 3 && w.layer === 5) ok = true;
            else if (w.flags.adult) ok = false;
            else if ((w.sceneName === "market_night" || w.sceneName === "market_day") && !talon && !w.inf("INFTABLE_MALON_SPAWNED_AT_HYRULE_CASTLE")) ok = true;
            else if (w.sceneName === "spot15" && !talon) ok = w.inf("INFTABLE_MALON_SPAWNED_AT_HYRULE_CASTLE"); // first visit sets the flag and kills
            else if (w.sceneName === "souko" && w.flags.night && talon) ok = true;
            else if (w.sceneName === "spot20") ok = rz === 3 && !w.flags.night && talon;
            if (!ok) w.kill(a, "EnMa1_ShouldSpawn false");
        },
        En_Ma2(w, a) {
            // z_en_ma2.c:251 SkelAnime_InitFlex(NULL tables) gMalonAdultSkel 18 limbs -> 2x ZELDA_ARENA_MALLOC(19*6) before the kill (freed by SkelAnime_Free)
            w.allocateFor(a, 0x72, "En_Ma2 jointTable", false);
            w.allocateFor(a, 0x72, "En_Ma2 morphTable", false);
            // EnMa2_GetSpawnIndex z_en_ma2.c:168-190
            const rz = (a.home.rot[2] << 16) >> 16, epona = w.event("EVENTCHKINF_EPONA_OBTAINED"), night = w.flags.night;
            let ok = false;
            if (!w.flags.adult) ok = false;
            else if (!epona && w.sceneName === "malon_stable" && !night && rz === 5) ok = true;
            else if (!epona && w.sceneName === "spot20" && night && rz === 6) ok = true;
            else if (!epona || w.sceneName !== "spot20") ok = false;
            else ok = (rz === 7 && !night) || (rz === 8 && night);
            if (!ok) w.kill(a, "MALON_ADULT_SPAWN_NONE");
        },
        En_Ma3(w, a) {
            // z_en_ma3.c:268 SkelAnime_InitFlex(NULL tables) gMalonAdultSkel 18 limbs -> 2x ZELDA_ARENA_MALLOC(19*6) before the kill (freed by SkelAnime_Free)
            w.allocateFor(a, 0x72, "En_Ma3 jointTable", false);
            w.allocateFor(a, 0x72, "En_Ma3 morphTable", false);
            // func_80AA2EC8 z_en_ma3.c:218-228 killed if child or Epona not obtained
            if (!w.flags.adult || !w.event("EVENTCHKINF_EPONA_OBTAINED")) w.kill(a, "child or Epona not obtained");
        },
        En_Mb(w, a) {
            // z_en_mb.c:276 no heap effect (club moblin's position flip depends on Link but spawns nothing; dust rings only while charging)
        },
        En_Mk(w, a) {
            // z_en_mk.c:62 no heap effect
        },
        En_Mm2(w, a) {
            // z_en_mm2.c:159-168 killed if child; params 1 also killed unless INFTABLE_17F and EVENTINF_MARATHON_ACTIVE (EVENTINF not modelled: assumed inactive)
            if (!w.flags.adult) return w.kill(a, "child Link");
            if (a.params === 1) w.kill(a, "marathon not active (EVENTINF assumed clear)");
        },
        En_Ms(w, a) {
            // z_en_ms.c:91-94 bean salesman killed if not child
            if (w.flags.adult) w.kill(a, "adult Link");
        },
        En_Mu(w, a) {
            // z_en_mu.c:147 SkelAnime_InitFlex(NULL tables) object_mu_Skel_004F70 15 limbs -> 2x ZELDA_ARENA_MALLOC(16*6) (freed by SkelAnime_Free)
            w.allocateFor(a, 0x60, "En_Mu jointTable", false);
            w.allocateFor(a, 0x60, "En_Mu morphTable", false);
        },
        En_Nb(w, a) {
            // z_en_nb.c:1473 Init; NB_TYPE_CRAWLSPACE (6) killed if EVENTCHKINF_95 or adult (:1143-1165); other types' spawns are cutscene-cue driven
            if ((a.params & 0xff) === 6 && (w.event("EVENTCHKINF_95") || w.flags.adult)) w.kill(a, "crawlspace Nabooru: EVENTCHKINF_95 or adult");
        },
        En_Niw(w, a) {
            // z_en_niw.c:144 Init; params < 0 -> 0; overlay statics sLowerRiverSpawned/sUpperRiverSpawned (:94-96) allow one of each river cucco
            let p = (a.params << 16) >> 16;
            if (p < 0) p = 0;
            const statics = w.overlayStatics(a);
            if (p === 0xb) {
                if (statics.lowerRiverSpawned) return w.kill(a, "lower river cucco already spawned");
                statics.lowerRiverSpawned = true;
                a.room = -1;
            }
            if (p === 0xc) {
                if (statics.upperRiverSpawned) return w.kill(a, "upper river cucco already spawned");
                statics.upperRiverSpawned = true;
                a.room = -1;
            }
            // z_en_niw.c:182-196 Kakariko cuccos already returned (INFTABLE_199..19F) are moved to the pen and become params 0
            if (w.sceneName === "spot01") {
                const spots = [[-1697, 870], [57, -673], [796, 1639], [1417, 169], [-60, -46], [-247, 854], [1079, -47]];
                spots.forEach(([x, z], i) => {
                    if (Math.abs(a.home.pos[0] - x) < 40 && Math.abs(a.home.pos[2] - z) < 40 && w.inf(["INFTABLE_199", "INFTABLE_19A", "INFTABLE_19B", "INFTABLE_19C", "INFTABLE_19D", "INFTABLE_19E", "INFTABLE_19F"][i])) p = 0;
                });
            }
            // z_en_niw.c:207-233 params kills
            if (p === 2 && !w.flags.night) return w.kill(a, "params 2: day");
            if (p === 1 && w.event("EVENTCHKINF_TALON_RETURNED_FROM_CASTLE")) return w.kill(a, "params 1: Talon returned");
            if (p === 3 && !w.event("EVENTCHKINF_TALON_RETURNED_FROM_CASTLE")) return w.kill(a, "params 3: Talon not returned");
            if (p === 5 && w.event("EVENTCHKINF_EPONA_OBTAINED")) return w.kill(a, "params 5: Epona obtained");
            if (p === 7 && !w.event("EVENTCHKINF_EPONA_OBTAINED")) return w.kill(a, "params 7: Epona not obtained");
            // z_en_niw.c:249-258 params 0xA/0xD/0xE in Link's house need EVENTCHKINF_HORSE_RACE_COW_UNLOCK
            if ((p === 0xa || p === 0xd || p === 0xe) && w.sceneName === "link_home" && !w.event("EVENTCHKINF_HORSE_RACE_COW_UNLOCK")) w.kill(a, "Link's house cucco: cow not unlocked");
        },
        En_Niw_Girl(w, a) {
            // z_en_niw_girl.c:84-94 spawns the chased cucco (En_Niw 0xA) as child 50 units in front (Matrix_RotateY(shape.rot.y) * (0,0,50))
            const ry = a.home.rot[1], ang = (((ry << 16) >> 16) / 0x8000) * Math.PI;
            const [x, y, z] = a.home.pos;
            const niw = w.spawn("En_Niw", 0x000a, "chased cucco", { parent: a, home: { pos: [x + Math.sin(ang) * 50, y, z + Math.cos(ang) * 50], rot: [0, ry, 0] } });
            if (!niw) w.kill(a, "cucco spawn failed"); // z_en_niw_girl.c:110
        },
        En_Niw_Lady(w, a) {
            // z_en_niw_lady.c:90-103 killed if OBJECT_ANE/OBJECT_OS_ANIME missing, or in Impa's house (SCENE_IMPAS_HOUSE) by day
            if (w.sceneName === "labo" && !w.flags.night) w.kill(a, "Impa's house: day");
        },
        En_Ny(w, a) {
            // z_en_ny.c:123 no heap effect (bubbles/drops only on death)
        },
        En_Ossan(w, a) {
            // z_en_ossan.c:595 Init; Talon (6) becomes Ingo (9) unless child; kills :616-630; also killed if its objects are missing (:634-653)
            let p = a.params;
            if (p === 6 && w.flags.adult) p = 9;
            if (p === 10 && !w.inf("INFTABLE_76")) return w.kill(a, "mask shop: INFTABLE_76 not set");
            if (p === 1 && !w.flags.adult) return w.kill(a, "Kakariko potion shop: child");
            if (p === 2 && !w.event("EVENTCHKINF_25")) return w.kill(a, "bombchu shop: EVENTCHKINF_25 not set");
            if (p > 10) return; // no such shopkeeper
            const objs = [["OBJECT_KM1", "OBJECT_MASTERKOKIRIHEAD", "OBJECT_MASTERKOKIRI"], ["OBJECT_DS2"], ["OBJECT_RS"], ["OBJECT_DS2"], ["OBJECT_OSSAN"], ["OBJECT_OSSAN"],
                ["OBJECT_OSSAN"], ["OBJECT_ZO", "OBJECT_MASTERZOORA"], ["OBJECT_OF1D_MAP", "OBJECT_MASTERGOLON"], ["OBJECT_OSSAN"], ["OBJECT_OS"]][p];
            // EnOssan_InitActionFunc z_en_ossan.c:2130 (UPDATE_CULLING_DISABLED) once objects load; returns early (retries) without an En_Tana
            w.whenObjectsLoaded(a, objs, () => {
                const shelves = w.live("En_Tana").find((t) => !t.killed);
                if (!shelves) return;
                // sInitFuncs z_en_ossan.c:2014-2066: SkelAnime_InitFlex(NULL tables) -> 2x (limbCount+1)*6 (freed by SkelAnime_Free in Destroy)
                const table = [0x60, 0x36, 0x36, 0x36, 0x36, 0x36, 0x36, 0x78, 0x6c, 0x36, 0x36][p];
                w.allocateFor(a, table, "En_Ossan jointTable", false);
                w.allocateFor(a, table, "En_Ossan morphTable", false);
                const offZ = [33, 31, 31, 31, 0, 0, 0, 36, 15, 0, 26][p];
                if (p === 0) w.spawn("En_Elf", 3, "Kokiri shopkeeper fairy", { parent: a, home: { pos: [a.home.pos[0], a.home.pos[1], a.home.pos[2] + offZ], rot: [0, 0, 0] } });
                // EnOssan_SpawnItemsOnShelves z_en_ossan.c:443-464: sShopkeeperStores (:218) SI_ params, offsets from En_Tana, sItemShelfRot (:169)
                const stores = [
                    [0x0d, 0x00, 0x04, 0x05, 0x1d, 0x2c, 0x01, 0x10], [0x09, 0x27, 0x08, 0x2b, 0x00, 0x28, 0x2a, 0x07], [0x18, 0x1c, 0x19, 0x15, 0x1a, 0x16, 0x1b, 0x17],
                    [0x09, 0x27, 0x08, 0x2b, 0x00, 0x28, 0x2a, 0x07], [0x0c, 0x2f, 0x00, 0x10, 0x2c, 0x02, 0x05, 0x01], [0x0c, 0x03, 0x00, 0x10, 0x2c, 0x02, 0x05, 0x01],
                    [0x11, 0x00, 0x04, 0x10, 0x12, 0x05, 0x10, 0x10], [0x0f, 0x2c, 0x10, 0x01, 0x00, 0x02, 0x07, 0x31], [0x03, 0x06, 0x2d, 0x2e, 0x0e, 0x10, 0x30, 0x10],
                    [0x13, 0x13, 0x13, 0x13, 0x14, 0x14, 0x14, 0x14], [0x25, 0x23, 0x22, 0x24, 0x20, 0x1e, 0x21, 0x1f]];
                const offsets = [[50, 52, -20], [50, 76, -20], [80, 52, -3], [80, 76, -3], [-50, 52, -20], [-50, 76, -20], [-80, 52, -3], [-80, 76, -3]];
                const shelfRot = [0xeaac, 0xeaac, 0xeaac, 0xeaac, 0x1554, 0x1554, 0x1554, 0x1554];
                // mask shop display gates (ShopItemDisp_* z_en_ossan.c:392-440)
                const gate = { 0x1f: "ITEMGETINF_39", 0x20: "ITEMGETINF_38", 0x21: "ITEMGETINF_3A", 0x23: "ITEMGETINF_3F", 0x24: "ITEMGETINF_3F", 0x25: "ITEMGETINF_3F" };
                const [sx, sy, sz] = shelves.home.pos, [rx, ry, rz] = shelves.home.rot;
                stores[p].forEach((si, i) => {
                    if (gate[si] && !w.itemGetInf(gate[si])) return;
                    const [ox, oy, oz] = offsets[i];
                    w.spawn("En_GirlA", si, `shop item ${i}`, { home: { pos: [sx + ox, sy + oy, sz + oz], rot: [rx, (ry + shelfRot[i]) & 0xffff, rz] } });
                });
            });
        },
        En_Po_Desert(w, a) {
            // z_en_po_desert.c:72 no heap effect (light node not arena; only follows its path)
        },
        En_Po_Relay(w, a) {
            // z_en_po_relay.c:128-133 overlay static sAlreadySpawned (:86) kills every Dampe ghost after the first since code load; survivor gets room -1 (:151)
            const statics = w.overlayStatics(a);
            if (statics.alreadySpawned) return w.kill(a, "Dampe ghost already spawned");
            statics.alreadySpawned = true;
            a.room = -1;
        },
        En_Rd(w, a) {
            // z_en_rd.c:165 no heap effect
        },
        En_Rl(w, a) {
            // z_en_rl.c:128/208 SkelAnime_InitFlex(NULL tables) object_rl_Skel_007B38 10 limbs -> 2x ZELDA_ARENA_MALLOC(11*6) (freed by SkelAnime_Free)
            w.allocateFor(a, 0x42, "En_Rl jointTable", false);
            w.allocateFor(a, 0x42, "En_Rl morphTable", false);
        },
        En_Rr(w, a) {
            // z_en_rr.c:186 no heap effect (drops only on death)
        },
        En_Ru1(w, a) {
            // z_en_ru1.c:2374 Init by type=params&0xFF; EnRu1_IsAssistingLink (another Ruto being carried) assumed false on load
            const type = a.params & 0xff;
            const met = w.inf("INFTABLE_RUTO_MET_FIRST_TIME"), back = w.inf("INFTABLE_RUTO_BROUGHT_BACK_TO_HOLES_ROOM");
            const onSwitch = w.inf("INFTABLE_RUTO_PLACED_ON_SWITCH"), sapphire = w.inf("INFTABLE_RUTO_HAS_SAPPHIRE");
            switch (type) {
                case 0: // boss room: blue warp (:1102) only after the Barinade cutscene trigger
                case 1: // fountain
                    break;
                case 2: // holes room z_en_ru1.c:849-871
                    if (!met) break;
                    if (back && !onSwitch && !sapphire) a.room = -1;
                    else w.kill(a, "holes room Ruto: flags");
                    break;
                case 3: // basement z_en_ru1.c:1282-1299
                    if (met && !sapphire && !onSwitch && !back) a.room = -1;
                    else w.kill(a, "basement Ruto: flags");
                    break;
                case 4: // sapphire room z_en_ru1.c:2245-2256
                    if (!(sapphire && !w.inf("INFTABLE_RUTO_ABDUCTED"))) w.kill(a, "sapphire room Ruto: flags");
                    break;
                case 5: // beside King Zora z_en_ru1.c:2268-2276
                    if (!(w.event("EVENTCHKINF_37") && !w.flags.adult)) w.kill(a, "throne room Ruto: EVENTCHKINF_37 unset or adult");
                    break;
                case 6: // beside door switch z_en_ru1.c:2332-2349
                    if (met && onSwitch && !sapphire) a.room = -1;
                    else w.kill(a, "door switch Ruto: flags");
                    break;
                default: // includes ENRU1_TYPE_DEBUG (10), compiled out of retail
                    w.kill(a, "invalid ENRU1_TYPE");
            }
        },
        En_Ru2(w, a) {
            // z_en_ru2.c:939 Init; type 4 (Water Temple encounter, :761-763) killed if switch (params>>8)&0xFF is set; others' spawns are cutscene-cue driven
            const sw = (f) => w.switchSet(f < 0x20 ? f : 0x20 | (f & 0x1f));
            if ((a.params & 0xff) === 4 && sw((a.params >> 8) & 0xff)) w.kill(a, "Water Temple Ruto: switch flag set");
        },
        En_Sb(w, a) {
            // z_en_sb.c:133 SkelAnime_InitFlex(NULL tables): 2x ZELDA_ARENA_MALLOC(9 limbs * 6 = 0x36); freed by SkelAnime_Free in Destroy (:150)
            a.arenaAllocs = [w.allocate(0x36, "En_Sb jointTable", false), w.allocate(0x36, "En_Sb morphTable", false)];
        },
        En_Siofuki(w, a) {
            // z_en_siofuki.c:57-72 room 10 with switch 0x1E set is killed; type (params>>12)&0xF must be 0 or 1
            if (a.room === 10 && w.switchSet(0x1e)) return w.kill(a, "room 10 and switch 0x1E set");
            const type = (a.params >> 12) & 0xf;
            if (type !== 0 && type !== 1) w.kill(a, "invalid type");
        },
        En_Skj(w, a) {
            // z_en_skj.c:386-435 type=(params>>10)&0x3F; 5/6 stump helpers -> PROP; 0-2 -> NPC; others need INV_CONTENT(ITEM_TRADE_ADULT) >= ITEM_POACHERS_SAW
            const type = (a.params >> 10) & 0x3f;
            if (type === 5 || type === 6) return w.changeCategory(a, 6); // ACTORCAT_PROP
            if (type > 2) {
                // empty trade slot is ITEM_NONE (0xFF), which passes; killed only while holding Pocket Egg..Odd Potion
                const later = ["ITEM_POACHERS_SAW", "ITEM_BROKEN_GORONS_SWORD", "ITEM_PRESCRIPTION", "ITEM_EYEBALL_FROG", "ITEM_EYE_DROPS", "ITEM_CLAIM_CHECK"].some((i) => w.hasItem(i));
                const earlier = ["ITEM_POCKET_EGG", "ITEM_POCKET_CUCCO", "ITEM_COJIRO", "ITEM_ODD_MUSHROOM", "ITEM_ODD_POTION"].some((i) => w.hasItem(i));
                if (earlier && !later) return w.kill(a, "adult trade item before Poacher's Saw");
            } else {
                w.changeCategory(a, 4); // ACTORCAT_NPC
            }
            // skeleton uses instance tables; needles (En_Skjneedle) only spawn during the fight
        },
        En_Ssh(w, a) {
            // z_en_ssh.c:627-635 father (params 0) gone at >=100 tokens, others gone at >= params*10 tokens (gsTokens not in API; defaults to 0)
            const tokens = w.flags.gsTokens || 0;
            if (a.params === 0 ? tokens >= 100 : tokens >= a.params * 10) w.kill(a, "curse lifted (gsTokens)");
            // Effect_Add(EFFECT_BLURE1) at :639 uses the static effect table, not the arena
        },
        En_Sth(w, a) {
            // z_en_sth.c:112-123 params 0 needs >=100 tokens, others need >= params*10 tokens (gsTokens not in API; defaults to 0)
            const tokens = w.flags.gsTokens || 0;
            if (a.params === 0 ? tokens < 100 : tokens < a.params * 10) w.kill(a, "still cursed (gsTokens)");
            // skeleton set up in WaitForObject (:162) with instance tables
        },
        En_Stream(w, a) {
            // z_en_stream.c:49 no heap effect (only sets scale/action)
        },
        En_Syateki_Itm(w, a) {
            // z_en_syateki_itm.c:86-102 SpawnAsChild En_Syateki_Man, then 10 En_Ex_Ruppy markers (params 4) as children, absolute positions
            const man = w.spawn("En_Syateki_Man", 0x0000, "shooting gallery man", { parent: a, home: { pos: [140, 0, 255], rot: [0, -0x4000, 0] } });
            if (!man) return w.kill(a, "En_Syateki_Man spawn failed");
            const pos = [[-40, 0, -90], [-20, 0, -90], [0, 0, -90], [20, 0, -90], [40, 0, -90], [-40, 0, -60], [-20, 0, -60], [0, 0, -60], [20, 0, -60], [40, 0, -60]];
            for (let i = 0; i < 10; i++) {
                if (!w.spawn("En_Ex_Ruppy", 0x0004, `gallery rupee marker ${i}`, { parent: a, home: { pos: pos[i], rot: [0, 0, 0] } })) return w.kill(a, "En_Ex_Ruppy spawn failed");
            }
        },
        En_Syateki_Niw(w, a) {
            // z_en_syateki_niw.c:83 no heap effect (instance skeleton tables; feathers are an internal effect array)
        },
        En_Ta(w, a) {
            // z_en_ta.c:178-283 params 1 = Kakariko, 2 = returned to ranch, else child-era Talon
            const p = (a.params << 16) >> 16;
            if (p === 1) {
                if (w.event("EVENTCHKINF_TALON_RETURNED_FROM_KAKARIKO") || !w.flags.adult) w.kill(a, "Kakariko Talon: returned or child");
            } else if (p === 2) {
                if (!w.event("EVENTCHKINF_TALON_RETURNED_FROM_KAKARIKO") || !w.flags.adult) return w.kill(a, "ranch Talon: not returned or child");
                if (w.sceneName === "malon_stable" && w.flags.night) w.kill(a, "stable at night");
            } else if (w.sceneName === "spot15") {
                if (w.event("EVENTCHKINF_TALON_RETURNED_FROM_CASTLE")) w.kill(a, "castle Talon: already returned");
            } else if (w.sceneName === "souko") {
                if (!w.event("EVENTCHKINF_TALON_RETURNED_FROM_CASTLE") || w.flags.adult) return w.kill(a, "Lon Lon house Talon: not returned or adult");
                if (!w.flags.night) {
                    // z_en_ta.c:244-252 three super cuccos (En_Niw params 0xD) for the cucco game, offsets from Talon
                    const [x, y, z] = a.home.pos;
                    w.spawn("En_Niw", 0x000d, "super cucco 1", { home: { pos: [x + 5, y + 3, z + 26], rot: [0, 0, 0] } });
                    w.spawn("En_Niw", 0x000d, "super cucco 2", { home: { pos: [x - 20, y + 40, z - 30], rot: [0, 0, 0] } });
                    w.spawn("En_Niw", 0x000d, "super cucco 3", { home: { pos: [x + 20, y + 40, z - 30], rot: [0, 0, 0] } });
                }
            }
        },
        En_Takara_Man(w, a) {
            // z_en_takara_man.c:58-80 only the first instance lives (overlay static sTakaraIsInitialized, never reset by Destroy); room = -1
            const s = w.overlayStatics(a);
            if (s.takaraIsInitialized) return w.kill(a, "chest game man already here");
            s.takaraIsInitialized = true;
            a.room = -1;
        },
        En_Tana(w, a) {
            // z_en_tana.c:70 no heap effect (shop shelf, only picks draw func)
        },
        En_Test(w, a) {
            // z_en_test.c:271 no heap effect (instance skeleton tables; Effect_Add blure uses the static effect table)
        },
        En_Tg(w, a) {
            // z_en_tg.c:120 SkelAnime_InitFlex(NULL tables): 2x ZELDA_ARENA_MALLOC(21 limbs * 6 = 0x7E); freed by SkelAnime_Free in Destroy (:133)
            a.arenaAllocs = [w.allocate(0x7e, "En_Tg jointTable", false), w.allocate(0x7e, "En_Tg morphTable", false)];
        },
        En_Tite(w, a) {
            // z_en_tite.c:193 no heap effect in Init (blue tektite on water spawns Effect_Ss_G_Ripple from Update; collision-dependent, see NOTES)
        },
        En_Torch(w, a) {
            // z_en_torch.c:33-43 spawns the grotto chest from respawn[RESPAWN_MODE_RETURN].data then kills itself (data not in API; defaults to 0)
            const rd = (w.flags.grottoReturnData || 0) & 0xff;
            const contents = [0x4d, 0x4e, 0x56, 0x67, 0x65, 0x65, 0x65, 0x65]; // GI_RUPEE_BLUE/RED/GOLD, GI_BOMBS_20, GI_BOMBS_1 x4
            const params = ((contents[(rd >> 5) & 7] << 5) | 0x5000 | (rd & 0x1f)) & 0xffff;
            w.spawn("En_Box", params, "grotto chest", { home: { pos: a.home.pos.slice(), rot: [0, a.home.rot[1], 0] } });
            w.kill(a, "spawned grotto chest");
        },
        En_Toryo(w, a) {
            // z_en_toryo.c:109-129 Gerudo Valley as adult, Kakariko as child by day, Kakariko guest house as child at night
            let ok = false;
            if (w.sceneName === "spot09") ok = w.flags.adult;
            else if (w.sceneName === "spot01") ok = !w.flags.adult && !w.flags.night;
            else if (w.sceneName === "kakariko") ok = !w.flags.adult && w.flags.night;
            if (!ok) w.kill(a, "wrong scene/age/time");
        },
        En_Tp(w, a) {
            // z_en_tp.c:163-194 head (params < 0) spawns 7 body elements En_Tp params 0 at its position (plain Actor_Spawn, parent linked by hand)
            const p = (a.params << 16) >> 16;
            if (p >= 0) return;
            for (let i = 0; i < 7; i++) {
                const c = w.spawn("En_Tp", 0x0000, `tailpasaran body ${i}`, { home: { pos: a.home.pos.slice(), rot: [0, 0, 0] } });
                // z_en_tp.c:181,185,673-688 element 2 gets UPDATE_CULLING_DISABLED and sparkTimer 3 -> Effect_Ss_KiraKira on its 3rd Update
                if (c && i === 2) w.afterUpdates(c, 3, () => w.effect("Effect_Ss_KiraKira"));
            }
        },
        En_Tr(w, a) {
            // z_en_tr.c:99 no heap effect on load (Demo_6K child only on cutscene cue 6, :173)
        },
        En_Tubo_Trap(w, a) {
            // z_en_tubo_trap.c:244-245 first Update: ACTORCAT_ENEMY once Link is within 200 xz and not below the pot (approximated with 3D distance)
            w.afterUpdates(a, 1, () => {
                if (w.near(a, 200) && w.linkPos && a.home.pos[1] <= w.linkPos[1]) w.changeCategory(a, 5); // ACTORCAT_ENEMY
            });
        },
        En_Vali(w, a) {
            // z_en_vali.c:168-173 killed only if no floor below (raycast; not modelled). No other heap effect
        },
        En_Wallmas(w, a) {
            // z_en_wallmas.c:144-151 switchFlag=(params>>8)&0xFF, type=params&0xFF; type 2 (WMT_FLAG) killed if switch set
            if ((a.params & 0xff) === 2 && w.switchSet((a.params >> 8) & 0xff)) w.kill(a, "switch flag set");
        },
        En_Weiyer(w, a) {
            // z_en_weiyer.c:228-238 first Update kills it if no water box above the floor (collision; not modelled)
        },
        En_Wf(w, a) {
            // z_en_wf.c:243,271-273 switchFlag=(params>>8)&0xFF (0xFF none); killed if set
            const flag = (a.params >> 8) & 0xff;
            if (flag !== 0xff && w.switchSet(flag)) w.kill(a, "switch flag set");
        },
        En_Yabusame_Mark(w, a) {
            // z_en_yabusame_mark.c:123-126 killed unless sceneLayer == 4 (horseback archery)
            if (w.layer !== 4) w.kill(a, "sceneLayer != 4");
        },
        En_Yukabyun(w, a) {
            // z_en_yukabyun.c:71 no heap effect on load (Effect_Ss_Hahen only when it breaks, :121)
        },
        En_Zl1(w, a) {
            // z_en_zl1.c:95 SkelAnime_InitFlex(NULL tables) before any kill: 2x ZELDA_ARENA_MALLOC(18 limbs * 6 = 0x6C); freed in Destroy (:132)
            a.arenaAllocs = [w.allocate(0x6c, "En_Zl1 jointTable", false), w.allocate(0x6c, "En_Zl1 morphTable", false)];
            // z_en_zl1.c:104-111 not on cutscene layers: killed once EVENTCHKINF_09, _25 and _37 are all set
            if (w.layer >= 4) return;
            if (w.event("EVENTCHKINF_09") && w.event("EVENTCHKINF_25") && w.event("EVENTCHKINF_37")) w.kill(a, "EVENTCHKINF_09/25/37 set");
        },
        En_Zl3(w, a) {
            // z_en_zl3.c:2713 Init no heap effect; first Update once OBJECT_ZL2_ANIME2 loads runs func_80B59B6C (:2677)
            const type = a.params & 0xf;
            const flag = (a.params >> 8) & 0xff;
            w.whenObjectsLoaded(a, ["OBJECT_ZL2_ANIME2"], () => {
                if (type === 0) {
                    // z_en_zl3.c:809 purple crystal warp (Door_Warp1 WARP_PURPLE_CRYSTAL=3) as child, 26 below Zelda
                    const [x, y, z] = a.home.pos;
                    w.spawn("Door_Warp1", 0x0003, "Zelda crystal warp", { parent: a, home: { pos: [x, y - 26, z], rot: [0, 0x4000, 0] } });
                } else if (type === 3) {
                    // z_en_zl3.c:2572-2620 escape Zelda; play->spawn as w.spawnIndex (not in API, default 0); func_80B59698 retry path assumed false (timer running)
                    const scene = w.sceneName, spawn = w.spawnIndex !== undefined ? w.spawnIndex : 0;
                    const cond37 = w.switchSet(0x37) && ["ganon_demo", "ganon_final", "ganon_sonogo", "ganontikasonogo"].includes(scene);
                    let path = false; // func_80B57890 (:1880)
                    if (scene === "ganon_sonogo") path = (flag === 0x24 && spawn === 0) || (flag === 0x25 && spawn === 2) || (flag === 0x26 && spawn === 4) || ((flag === 0x27 || flag === 0x28) && spawn === 6);
                    else if (scene === "ganon_final") path = (flag === 0x20 && spawn === 0 && w.switchSet(0x37)) || (flag === 0x21 && spawn === 2) || (flag === 0x22 && spawn === 4) || (flag === 0x23 && spawn === 6);
                    else if (scene === "ganontikasonogo") path = (flag === 0x29 || flag === 0x2a) && spawn === 0;
                    if (w.switchSet(flag) || !path) w.kill(a, "escape Zelda not for this spawn/flag");
                    // kill does not return: params flag 0x20 still spawns En_Eg and (cond37) En_River_Sound
                    if (flag === 0x20) {
                        w.spawn("En_Eg", 0x0000, "tower collapse void trigger", { home: { pos: a.home.pos.slice(), rot: [0, 0, 0] } });
                        if (cond37) w.spawn("En_River_Sound", 0x0012, "collapse rumble sound", { home: { pos: [-442, 4102, -371], rot: [0, 0, 0] } });
                    }
                } else if (type !== 1) {
                    w.kill(a, "bad arg_data");
                }
            });
        },
        En_Zl4(w, a) {
            // z_en_zl4.c:376 no heap effect (instance skeleton tables, only picks cutscene/idle state)
        },
        En_Zo(w, a) {
            // z_en_zo.c:595-598 params&0x3F == 8 is killed for adult Link (ripples/bubbles are an internal effect array)
            if (w.flags.adult && (a.params & 0x3f) === 8) w.kill(a, "adult, type 8");
        },
        End_Title(w, a) {
            // z_end_title.c:157 no heap effect
        },
        Fishing(w, a) {
            const p = (a.params << 16) >> 16;
            if (p < 100) {
                // z_fishing.c:883 owner: SkelAnime_InitFlex(NULL tables) 2x ZELDA_ARENA_MALLOC(9 limbs * 6 = 0x36); freed in Destroy (:1076)
                a.arenaAllocs = [w.allocate(0x36, "Fishing owner jointTable", false), w.allocate(0x36, "Fishing owner morphTable", false)];
                // z_fishing.c:1001-1003 sign (En_Kanban ENKANBAN_FISHING 0x300) as child, then the record-fish aquarium (params 200)
                w.spawn("En_Kanban", 0x0300, "fishing pond sign", { parent: a, home: { pos: [53, -17, 982], rot: [0, 0, 0] } });
                w.spawn("Fishing", 200, "aquarium fish", { home: { pos: [0, 0, 0], rot: [0, 0, 0] } });
                // z_fishing.c:932,1008-1023 sFishGameNumber = HIGH_SCORE(HS_FISHING)>>16 & 0xFF (not in API; defaults to 0): 15 fish, 16/17 every 4th game
                const games = (w.flags.fishingGamesPlayed || 0) & 0xff;
                const count = (games & 3) === 3 ? (w.flags.adult ? 16 : 17) : 15;
                const pos = [[666, -45, 354], [681, -45, 240], [670, -45, 90], [615, -45, -450], [500, -45, -420], [420, -45, -550], [-264, -45, -640], [-470, -45, -540],
                    [-557, -45, -430], [-260, -60, -330], [-500, -60, 330], [428, -40, -283], [409, -70, -230], [450, -67, -300], [-136, -65, -196], [-561, -35, -547], [667, -35, 317]];
                for (let i = 0; i < count; i++) w.spawn("Fishing", 100 + i, `pond fish ${i}`, { home: { pos: pos[i], rot: [0, 0, 0] } }); // rot.y is random
                return;
            }
            // z_fishing.c:1028-1034 fish (params < 115 or 200) 16 joints -> 0x60 each; loaches (115, 116) 12 joints -> 0x48 each
            const size = p < 115 || p === 200 ? 0x60 : 0x48;
            a.arenaAllocs = [w.allocate(size, "Fishing fish jointTable", false), w.allocate(size, "Fishing fish morphTable", false)];
            if (p === 200) w.changeCategory(a, 6); // z_fishing.c:1040 ACTORCAT_PROP
        },
        Item_Etcetera(w, a) {
            // z_item_etcetera.c:108-148 type=params&0xFF; letter (1) killed if EVENTCHKINF_31
            const type = a.params & 0xff;
            if (type === 1) {
                if (w.event("EVENTCHKINF_31")) return w.kill(a, "Ruto's letter already taken");
                // z_item_etcetera.c:184-186 once OBJECT_GI_BOTTLE_LETTER loads, bubbles when (gameplayFrames & 0xD) == 0 (within 16 frames)
                w.whenObjectsLoaded(a, ["OBJECT_GI_BOTTLE_LETTER"], () => w.afterUpdates(a, 1, () => w.effect("Effect_Ss_Bubble")));
            } else if (type >= 8 && type <= 13) {
                // z_item_etcetera.c:217-219 chest game prizes: killed after their object loads if treasure flag (params>>8)&0x1F is set
                const objects = [type === 12 ? "OBJECT_GI_HEARTS" : type === 13 ? "OBJECT_GI_KEY" : "OBJECT_GI_RUPY"];
                w.whenObjectsLoaded(a, objects, () => w.afterUpdates(a, 1, () => {
                    if (w.chestOpened((a.params >> 8) & 0x1f)) w.kill(a, "treasure flag set");
                }));
            } else if (type === 7) {
                // z_item_etcetera.c:222-237 fire arrow outside a cutscene starts falling and sparkles (Effect_Ss_KiraKira) while airborne
                w.whenObjectsLoaded(a, ["OBJECT_GI_M_ARROW"], () => w.afterUpdates(a, 2, () => w.effect("Effect_Ss_KiraKira")));
            }
        },
        Mir_Ray(w, a) {
            // z_mir_ray.c:189-240 params >= 0xA killed; Spirit Temple top room beams (5, 7, 8) get room = -1 (light node is static, not arena)
            if (a.params >= 0xa) return w.kill(a, "bad params");
            if (a.params === 5 || a.params === 7 || a.params === 8) a.room = -1;
        },
        Obj_Blockstop(w, a) {
            // z_obj_blockstop.c:35 killed if Flags_GetSwitch(params) (whole params is the flag)
            if (w.switchSet(a.params)) w.kill(a, "switch flag set");
        },
        Obj_Comb(w, a) {
            // z_obj_comb.c:161 no heap effect until hit (Kakera/drop only on break)
        },
        Obj_Kibako(w, a) {
            // z_obj_kibako.c:102 no heap effect (breaks on first Update if >19 deep in water: collision, not modelled)
        },
        Obj_Lightswitch(w, a) {
            // z_obj_lightswitch.c:178-219 flag=(params>>8)&0x3F, type=(params>>4)&3; bit 0 spawns a small push block child first
            const set = w.switchSet((a.params >> 8) & 0x3f);
            if (a.params & 1) {
                const pos = set ? [-1707, 843, -180] : a.home.pos.slice(); // D_80B97F68 when already on
                if (set) a.home.pos = pos.slice();
                const block = w.spawn("Obj_Oshihiki", 0xff00, "light switch push block", { parent: a, home: { pos, rot: [0, a.home.rot[1], 0] } });
                if (!block) return w.kill(a, "push block spawn failed");
            }
            if (set && ((a.params >> 4) & 3) === 3) w.kill(a, "burn type already lit");
        },
        Obj_Roomtimer(w, a) {
            // z_obj_roomtimer.c:55-62 first Update: Interface_SetTimer and Actor_ChangeCategory ACTORCAT_PROP
            w.afterUpdates(a, 1, () => w.changeCategory(a, 6));
        },
        Obj_Timeblock(w, a) {
            // z_obj_timeblock.c:116 no heap effect on load (Demo_Effect only after Song of Time, :103)
        },
        Obj_Warp2block(w, a) {
            // z_obj_warp2block.c:226-288 bit15 blocks look for a partner (no bit15, same params&0x3F) each Update; killed after 61 failed Updates
            if (!(a.params & 0x8000)) return;
            w.afterUpdates(a, 61, () => {
                const partner = w.live("Obj_Warp2block").some((o) => o !== a && !(o.params & 0x8000) && (o.params & 0x3f) === (a.params & 0x3f));
                if (!partner) w.kill(a, "no Warp2 partner block");
            });
        },
    };

    // z_horse.c Horse_InitPlayerHorse: adult Link's horse is spawned by Play_Init in the five horse scenes
    const HORSE_SCENES = ["SCENE_HYRULE_FIELD", "SCENE_LAKE_HYLIA", "SCENE_GERUDO_VALLEY", "SCENE_GERUDOS_FORTRESS", "SCENE_LON_LON_RANCH"];
    const HORSE_GAMEPLAY_SPAWNS = {
        SCENE_HYRULE_FIELD: [-460, 100, 6640], SCENE_LAKE_HYLIA: [-1929, -1025, 768], SCENE_GERUDO_VALLEY: [2566, -259, 767],
        SCENE_GERUDOS_FORTRESS: [-328, 10, 953], SCENE_LON_LON_RANCH: [928, 0, -2280],
    };
    const HORSE_CUTSCENE_SPAWNS = [
        ["SCENE_GERUDOS_FORTRESS", 0xfff0, [3600, 1413, 360], 0x8001, 8], ["SCENE_LON_LON_RANCH", 0xfff0, [-250, 1, -1580], 0x4000, 6],
        ["SCENE_LON_LON_RANCH", 0xfff1, [0, 0, 0], 0, 5], ["SCENE_LON_LON_RANCH", 0xfff5, [0, 0, 0], 0, 7],
        ["SCENE_HYRULE_FIELD", 0xfff3, [-2961, 313, 7700], 0, 7], ["SCENE_HYRULE_FIELD", 0xfff4, [-1900, 313, 7015], 0, 7],
        ["SCENE_HYRULE_FIELD", 0xfff5, [-4043, 313, 6933], 0, 7], ["SCENE_HYRULE_FIELD", 0xfff6, [-4043, 313, 6933], 0, 7],
    ];
    const FENCE_JUMPS = { ENTR_HYRULE_FIELD_11: [-2961, 313, 7700], ENTR_HYRULE_FIELD_12: [-1900, 313, 7015], ENTR_HYRULE_FIELD_13: [-4043, 313, 6933], ENTR_HYRULE_FIELD_15: [-2313, 313, 5990] };
    function playerHorse(w) {
        if (!w.flags.adult || !w.sceneData) return;
        const scene = w.sceneData.enum;
        const epona = w.event("EVENTCHKINF_EPONA_OBTAINED");
        const horse = (pos, angle, params, why) => {
            const actor = w.spawn("En_Horse", params, why, { home: { pos: pos.slice(), rot: [0, angle << 16 >> 16, 0] } });
            if (actor && scene === "SCENE_GERUDOS_FORTRESS") actor.room = -1;
            return actor;
        };
        // z_horse.c:297-305 the saved spot is reset if it isn't in a horse scene
        if (!HORSE_SCENES.includes(w.flags.horseScene)) Object.assign(w.flags, { horseScene: "SCENE_HYRULE_FIELD", horsePos: [-1840, 72, 5497], horseAngle: -0x6ad9 });
        if (!HORSE_SCENES.includes(scene)) return;
        const fence = FENCE_JUMPS[w.entranceBase] && w.respawnFlag === 0;
        if (w.layer >= 4 || fence) {
            // z_horse.c:165-292 Horse_SetupInCutscene
            if (fence) return horse(FENCE_JUMPS[w.entranceBase], w.linkAngle || 0, 7, "Epona (fence jump)");
            const entry = HORSE_CUTSCENE_SPAWNS.find(([s, cs]) => s === scene && cs === w.cutsceneIndex);
            if (!entry) return;
            const pos = scene === "SCENE_LON_LON_RANCH" && entry[1] === 0xfff1 && w.linkPos ? w.linkPos : entry[2];
            return horse(pos, entry[4] === 7 ? w.linkAngle || 0 : entry[3], entry[4], "horse (cutscene)");
        }
        // z_horse.c:65-163 Horse_SetupInGameplay (the horseback archery and Ingo race states are not modelled)
        if (w.flags.ridingEpona && epona) return horse(w.linkPos || [0, 0, 0], w.linkAngle || 0, 9, "Epona (Link riding in)");
        if (w.entranceBase === "ENTR_LON_LON_RANCH_7" && epona) return horse([-25, 0, -1600], -0x4000, 1, "Epona (after the race)");
        if (scene === w.flags.horseScene && epona) return horse(w.flags.horsePos, w.flags.horseAngle, 1, "Epona (where she was left)");
        if (scene === "SCENE_LON_LON_RANCH" && !epona) return horse([0, 0, -500], 0, 1, "ranch horse");
        if (epona) return horse(HORSE_GAMEPLAY_SPAWNS[scene], 0, 2, "Epona (waiting for her song)");
    }

    // z_kaleido_scope.c:4572-4650 Continue after a game over reloads the last entrance, but a boss room gives its dungeon's
    // entrance and the Ganon collapse gives the collapse exit
    const GAME_OVER_BOSS_ENTRANCES = {
        ENTR_DEKU_TREE_BOSS_0: "ENTR_DEKU_TREE_0", ENTR_DODONGOS_CAVERN_BOSS_0: "ENTR_DODONGOS_CAVERN_0", ENTR_JABU_JABU_BOSS_0: "ENTR_JABU_JABU_0",
        ENTR_FOREST_TEMPLE_BOSS_0: "ENTR_FOREST_TEMPLE_0", ENTR_FIRE_TEMPLE_BOSS_0: "ENTR_FIRE_TEMPLE_0", ENTR_WATER_TEMPLE_BOSS_0: "ENTR_WATER_TEMPLE_0",
        ENTR_SPIRIT_TEMPLE_BOSS_0: "ENTR_SPIRIT_TEMPLE_0", ENTR_SHADOW_TEMPLE_BOSS_0: "ENTR_SHADOW_TEMPLE_0", ENTR_GANONDORF_BOSS_0: "ENTR_GANONS_TOWER_0",
    };
    const COLLAPSE_SCENES = ["SCENE_GANONS_TOWER_COLLAPSE_INTERIOR", "SCENE_GANONS_TOWER_COLLAPSE_EXTERIOR", "SCENE_INSIDE_GANONS_CASTLE_COLLAPSE", "SCENE_GANON_BOSS"];
    function gameOverEntrance(base, sceneEnum) {
        if (COLLAPSE_SCENES.includes(sceneEnum)) return "ENTR_GANONS_TOWER_COLLAPSE_EXTERIOR_0";
        return GAME_OVER_BOSS_ENTRANCES[base] || base;
    }

    // z_skin_awb.c Skin_Init: the limb table, both vertex buffers of the animated limb, then SkelAnime_InitSkin's two tables
    function skinAllocs(w, a, name, limbs, vertices) {
        w.allocateFor(a, limbs * 0xc, `${name} skin vtxTable`, false);
        w.allocateFor(a, vertices * 0x10, `${name} skin vtx buf 0`, false);
        w.allocateFor(a, vertices * 0x10, `${name} skin vtx buf 1`, false);
        w.allocateFor(a, (limbs + 1) * 6, `${name} jointTable`, false);
        w.allocateFor(a, (limbs + 1) * 6, `${name} morphTable`, false);
    }

    // Static variables in an actor's code live as long as the code does, and start again when it reloads
    Sim.World.prototype.overlayStatics = function (actor) {
        const overlay = this.overlays.get(actor.id);
        if (overlay) return (overlay.statics = overlay.statics || {});
        this.internalStatics = this.internalStatics || {};
        return (this.internalStatics[actor.id] = this.internalStatics[actor.id] || {});
    };
    Sim.World.prototype.roomCleared = function (room) {
        const clears = this.sceneFlags().clears;
        return (clears && clears.has(room)) || (this.tempClears || new Set()).has(room);
    };

    // What actors do when a cutscene cue reaches them (w.cue(channel), w.csFrame); keyed like INIT
    const CUES = {
        // z_bg_dy_yoseizo.c:626-836 reward path (Reward_WaitCutscene, set in SetupCutscene :357 when the reward is new): reads actorCues[0]
        // every frame. Only runs when the playing cutscene is the fairy's own gGreatFairy*Cs (it never reads cues otherwise).
        Bg_Dy_Yoseizo(w, a) {
            if (!w.cs || !/GreatFairy/.test(w.cs.source || "")) return;
            const cue = w.cue(0);
            const s = (a.cueState = a.cueState || { phase: "wait" });
            const magic = w.sceneName === "daiyousei_izumi"; // SCENE_GREAT_FAIRYS_FOUNTAIN_MAGIC
            if (s.phase === "wait") {
                // z_bg_dy_yoseizo.c:626-628 cue 2: appear
                if (cue && cue.id === 2) s.phase = "appear";
                return;
            }
            if (s.phase === "appear") {
                // z_bg_dy_yoseizo.c:680-682 cue 3 (once done appearing): give the reward
                if (cue && cue.id === 3) s.phase = "give";
                return;
            }
            if (s.phase !== "give" || !cue) return;
            // z_bg_dy_yoseizo.c:725-728 cue 13: SetupDisappear -> timer 5, ~33 frames shrinking, timer 30 -> BgDyYoseizo_Kill (:606-622)
            // kills the first En_Okarina_Tag in the PROP list and itself, 69 updates after this one
            if (cue.id === 13) {
                s.phase = "disappear";
                w.afterUpdates(a, 70, () => {
                    const tag = (w.lists[6] || []).find((x) => x.info.name === "En_Okarina_Tag");
                    if (tag) w.kill(tag, "Great Fairy gone");
                    w.kill(a, "Great Fairy vanished");
                });
                return;
            }
            // z_bg_dy_yoseizo.c:729-741 spell fountain, cues 4-6: Demo_Effect DEMO_EFFECT_LIGHT (green/red/blue) at the fairy, once
            if (!magic && cue.id >= 4 && cue.id <= 6 && !s.light) {
                const params = [0x2012, 0x0012, 0x1012][cue.id - 4];
                w.spawn("Demo_Effect", params, "Great Fairy light", { home: { pos: a.home.pos.slice(), rot: [0, 0, 0] } });
                s.light = true;
            }
            // z_bg_dy_yoseizo.c:778-805 spell fountain, cues 14-16: En_Ex_Item (EXITEM_MAGIC_WIND/FIRE/DARK) child above Link, until it spawns
            if (!magic && cue.id >= 14 && cue.id <= 16 && !s.item) {
                const pos = w.linkPos ? [w.linkPos[0], w.linkPos[1] + (w.flags.adult ? 73 : 53), w.linkPos[2]] : a.home.pos.slice();
                s.item = w.spawn("En_Ex_Item", [17, 16, 18][cue.id - 14], "spell item", { parent: a, home: { pos, rot: [0, 0, 0] } });
            }
            // z_bg_dy_yoseizo.c:816-820 spell fountain, cue 17: kill the item
            if (!magic && cue.id === 17 && s.item) {
                w.kill(s.item, "Great Fairy cue 17");
                s.item = null;
            }
            // z_bg_dy_yoseizo.c:830-835 cues 19-21: Door_Warp1 WARP_ORANGE/GREEN/RED (8-10) at Link, once
            if (cue.id >= 19 && cue.id <= 21 && !s.warp) {
                w.spawn("Door_Warp1", cue.id - 11, "Great Fairy warp light", { home: { pos: (w.linkPos || a.home.pos).slice(), rot: [0, 0, 0] } });
                s.warp = true;
            }
        },
        // z_bg_gjyo_bridge.c:93-100 SpawnBridge (after the trigger set gRainbowBridgeCs): actorCues[2] id 2 sets the bridge flag
        Bg_Gjyo_Bridge(w, a) {
            if (!w.cs || !/RainbowBridge/.test(w.cs.source || "")) return;
            const cue = w.cue(2);
            if (cue && cue.id === 2) w.flags.events.add("EVENTCHKINF_CREATED_RAINBOW_BRIDGE");
        },
        // z_bg_spot01_idohashira.c:245-311 layer 4 only (action 1, Init :338); actorCues[2]
        Bg_Spot01_Idohashira(w, a) {
            const s = (a.cueState = a.cueState || { action: w.layer === 4 ? 1 : 0, id: 0 });
            const cue = w.cue(2);
            if (!cue) return;
            if (s.action === 1 || s.action === 3) {
                if (cue.id === s.id) return;
                s.id = cue.id;
                if (cue.id === 1) s.action = 1;
                // z_bg_spot01_idohashira.c:236-240 cue 2: falls; its next draw (func_808AAF34 :146-155) spawns Effect_Ss_Dust via func_80033480
                else if (cue.id === 2) {
                    s.action = 2;
                    w.effect("Effect_Ss_Dust");
                }
                // z_bg_spot01_idohashira.c:268-269 cue 3: killed
                else if (cue.id === 3) w.kill(a, "cutscene cue 3");
            } else if (s.action === 2 && w.csFrame >= cue.end) {
                // z_bg_spot01_idohashira.c:299-301,242-246 lands at the cue's end frame: dust (func_808AAE6C), action 3
                w.effect("Effect_Ss_Dust");
                s.action = 3;
            }
        },
        Bg_Spot02_Objects(w, a) {
            const type = a.params & 0xff;
            const s = (a.cueState = a.cueState || { count: 0 });
            if (type === 2 && w.sceneName === "spot02") {
                // z_bg_spot02_objects.c:144-157 grave (Graveyard): actorCues[3] id 2 sets EVENTCHKINF_1D, Bomb2, timer 25;
                // :162-171 Hahen burst 5 updates later, killed 25 updates later
                if (s.blown) return;
                const cue = w.cue(3);
                if (!cue || cue.id !== 2) return;
                s.blown = true;
                w.flags.events.add("EVENTCHKINF_1D");
                w.effect("Effect_Ss_Bomb2");
                w.afterUpdates(a, 6, () => {
                    w.effect("Effect_Ss_Hahen");
                    w.afterUpdates(a, 20, () => w.kill(a, "grave blown up"));
                });
            } else if (type === 3) {
                // z_bg_spot02_objects.c:216-222 lightning: killed on the 12th update with actorCues[0] id 2
                const cue = w.cue(0);
                if (cue && cue.id === 2 && ++s.count >= 12) w.kill(a, "lightning done");
            } else if (type === 4) {
                // z_bg_spot02_objects.c:283-293 timer -12 -> 32 while actorCues[2] id 2: killed on the 45th such update
                const cue = w.cue(2);
                if (cue && cue.id === 2 && ++s.count >= 45) w.kill(a, "effect done");
            }
        },
        Bg_Spot16_Doughnut(w, a) {
            // z_bg_spot16_doughnut.c:106-117 actorCues[2] id 2 only fades the cloud's colour (expanding rings kill themselves, not cue driven)
        },
        Bg_Treemouth(w, a) {
            // z_bg_treemouth.c:130-135 child, layer 6 (func_808BC6F8 from Init :92): after cs frame 700, every 8th frame, Effect_Ss_Hahen
            // (cues 2/3 on actorCues[0] only move the mouth)
            if (w.layer === 6 && !w.flags.adult && w.csFrame > 700) w.effect("Effect_Ss_Hahen");
        },
        Demo_6K(w, a) {
            const p = (a.params << 16) >> 16;
            const s = (a.cueState = a.cueState || {});
            if (p === 1) {
                // z_demo_6k.c:234-237 actorCues[6] id 2 -> func_80966E98: timer1 39 (40th run) spawns Demo_6K 2 at pos + 10y (:249-254),
                // timer1 64 (65th run) kills itself (:256-258)
                if (s.go) return;
                const cue = w.cue(6);
                if (!cue || cue.id !== 2) return;
                s.go = true;
                w.afterUpdates(a, 41, () => {
                    const pos = [a.home.pos[0], a.home.pos[1] + 10, a.home.pos[2]];
                    w.spawn("Demo_6K", 2, "sage light ball", { home: { pos, rot: [0, 0, 0] } });
                    w.afterUpdates(a, 25, () => w.kill(a, "timer1 == 64"));
                });
            } else if (p >= 3 && p <= 8) {
                // z_demo_6k.c:308-313 actorCues[6] id 2 -> func_809670AC: 10 updates wait, 13 shrinking (0.1 by 1/120), killed on the 24th
                if (s.go) return;
                const cue = w.cue(6);
                if (!cue || cue.id !== 2) return;
                s.go = true;
                w.afterUpdates(a, 25, () => w.kill(a, "shrunk away"));
            } else if (p >= 14 && p <= 19) {
                // z_demo_6k.c:362-381 actorCues[params - 14] id 3: Effect_Ss_KiraKira every update (func_80967244)
                const cue = w.cue(p - 14);
                if (cue && cue.id === 3) w.effect("Effect_Ss_KiraKira");
            }
            // Types 0, 2, 9-13 act on timers only (INIT); type 0 moves on actorCues[1]
        },
        Demo_Du(w, a) {
            const s = (a.cueState = a.cueState || {});
            if (a.params === 1) {
                // DEMO_DU_CS_GORONS_RUBY: GR_00 -> GR_01 on its first update; z_demo_du.c:483-495 actorCues[2] id != 1 -> falling;
                // :497-507 lands at the cue's end frame: func_8096A630 -> func_80033480 -> Effect_Ss_Dust (the later hit dust is the same type)
                const cue = w.cue(2);
                if (!s.st) s.st = 1;
                if (s.st === 1 && cue && cue.id !== 1) s.st = 2;
                else if (s.st === 2 && cue && w.csFrame >= cue.end) {
                    s.st = 3;
                    w.effect("Effect_Ss_Dust");
                }
            } else if (a.params === 2) {
                // DEMO_DU_CS_CHAMBER_AFTER_GANON (z_demo_du.c:735-788), actorCues[2]
                const cue = w.cue(2);
                const is4 = !!cue && cue.id === 4;
                if (!s.st) s.st = 0, s.t = 0;
                if (s.st === 0) {
                    if (is4) s.st = 1, s.t = 0;
                } else if (s.st === 1) {
                    // :746-774 fades in over 10 updates of cue 4, back to 0 if the cue goes
                    if (is4) {
                        if (++s.t >= 10) s.st = 2, s.t = 10;
                    } else if (--s.t <= 0) s.st = 0, s.t = 0;
                } else if (s.st === 2 && cue && cue.id !== 4) {
                    // :776-788,730-733 another cue: Demo_6K 3 as child at pos + 22y, once
                    s.st = 1;
                    s.t = 10;
                    if (!s.spawned6K) {
                        const pos = [a.home.pos[0], a.home.pos[1] + 22, a.home.pos[2]];
                        w.spawn("Demo_6K", 3, "Darunia sage light", { parent: a, home: { pos, rot: [0, 0, 0] } });
                        s.spawned6K = true;
                    }
                }
            } else if (a.params === 3) {
                // DEMO_DU_CS_CREDITS (z_demo_du.c:903-929): cues 9-11 only change animations
            } else {
                // DEMO_DU_CS_FIREMEDALLION: FM_00 -> FM_01 only when it sets gFireMedallionCs itself (:212-225, chamber cs, not a cs layer)
                if (w.layer >= 4 || !w.cs || !/FireMedallion/.test(w.cs.source || "")) return;
                const cue = w.cue(2);
                if (!s.st) s.st = 1;
                if (s.st === 1) {
                    // :227-236 actorCues[2] id != 1: Door_Warp1 WARP_SAGES (2) child at Darunia
                    if (cue && cue.id !== 1) {
                        s.st = 2;
                        s.t = 0;
                        w.spawn("Door_Warp1", 2, "sage warp", { parent: a, home: { pos: a.home.pos.slice(), rot: [0, 0, 0] } });
                    }
                } else if (s.st === 2) {
                    // :239-243 rises for 121 updates (yOffset -10000 += 250/3)
                    if (++s.t >= 121) s.st = 3;
                } else if (s.st === 3) {
                    // :246-255 actorCues[2] id != 2: item-give animation (its length is not modelled)
                    if (cue && cue.id !== 2) s.st = 4;
                } else if (s.st === 4) {
                    // :266-275,196-204 actorCues[6] id 2: Demo_Effect DEMO_EFFECT_MEDAL_FIRE (9) child above Link
                    const c6 = w.cue(6);
                    if (c6 && c6.id === 2) {
                        s.st = 5;
                        const pos = w.linkPos ? [w.linkPos[0], w.linkPos[1] + 80, w.linkPos[2]] : a.home.pos.slice();
                        w.spawn("Demo_Effect", 0x0009, "Fire Medallion", { parent: a, home: { pos, rot: [0, 0, 0] } });
                    }
                }
            }
        },
        Demo_Ec(w, a) {
            // z_demo_ec.c:835-935 cue handlers (King Zora ch6, Mido ch7, ...) only change animations and positions
        },
        Demo_Effect(w, a) {
            const type = a.params & 0xff;
            const s = (a.cueState = a.cueState || {});
            // DemoEffect_SetPosRotFromCue (:2050): position lerped over the cue
            const cuePos = (c) => {
                const t = c.end > c.start ? Math.min(Math.max((w.csFrame - c.start) / (c.end - c.start), 0), 1) : 1;
                return c.startPos.map((v, i) => v + (c.endPos[i] - v) * t);
            };
            // Children end on their own timers: 1 WaitForObject update, then the type's update function
            const expire = (child, updates, why) => {
                if (child) w.afterUpdates(child, updates, () => w.kill(child, why));
                return child;
            };
            const spawnAt = (params, tag, pos, rot, parent) => w.spawn("Demo_Effect", params, tag, { parent, home: { pos: pos.slice(), rot: rot || [0, 0, 0] } });
            if ((type >= 0x09 && type <= 0x0e) || type === 0x17) {
                // z_demo_effect.c:639-648 medals / light arrow, actorCues[6] id 2/3 at ENTR_TEMPLE_OF_TIME_0: Effect_Ss_KiraKira (MedalSparkle)
                const cue = w.cue(6);
                if (cue && (cue.id === 2 || cue.id === 3) && w.entranceBase === "ENTR_TEMPLE_OF_TIME_0") w.effect("Effect_Ss_KiraKira");
            } else if (type === 0x11) {
                // z_demo_effect.c:918-936 triforce light ring, actorCues[4] id 2: Demo_Effect DEMO_EFFECT_BLUE_ORB (2), then it is an
                // expanding ring (timer 20 += 4, killed past 255: 59 updates later, :900-911)
                if (s.orb) return;
                const cue = w.cue(4);
                if (!cue || cue.id !== 2) return;
                s.orb = true;
                // Blue orb: grows 6 updates, shrinks 15 (:1011-1047): killed on its 22nd update
                expire(spawnAt(0x0002, "triforce blue orb", a.home.pos), 22, "blue orb shrunk");
                w.afterUpdates(a, 60, () => w.kill(a, "light ring expanded"));
            } else if (type === 0x04) {
                // z_demo_effect.c:1152-1168 Din, actorCues[0] id 3: every update a DEMO_EFFECT_FIRE_BALL (1) child with InitCreationFireball.
                // The fireball (:945-983): 1 wait, 1 init (timer 50), 50 falling, then on its 53rd update spawns a blue orb (2), an
                // expanding ring (7) and a shrinking ring (0x10) and is killed
                const cue = w.cue(0);
                if (!cue || cue.id !== 3) return;
                const fireball = spawnAt(0x0001, "Din fireball", cuePos(cue), null, a);
                if (fireball) {
                    w.afterUpdates(fireball, 53, () => {
                        const pos = fireball.home.pos;
                        expire(spawnAt(0x0002, "fireball blue orb", pos), 22, "blue orb shrunk");
                        // Expanding ring: 1 wait + 59 updates (timer 20 += 4 past 255)
                        expire(spawnAt(0x0007, "fireball ring (expanding)", pos), 60, "light ring expanded");
                        // Shrinking ring: 1 wait + 176 updates (timer 351 -= 2 below 2)
                        expire(spawnAt(0x0010, "fireball ring (shrinking)", pos), 177, "light ring shrunk");
                        w.kill(fireball, "fireball exploded");
                    });
                }
            } else if (type === 0x05) {
                // z_demo_effect.c:1202-1222 Nayru, actorCues[1] id 3: a DEMO_EFFECT_LIGHTRING_EXPANDING (7) every 5th update (spawn delay 4),
                // not a child; each is killed on its 60th update
                const cue = w.cue(1);
                if (!cue || cue.id !== 3) return;
                if (s.ringTimer) {
                    s.ringTimer--;
                    return;
                }
                s.ringTimer = 4;
                expire(spawnAt(0x0007, "Nayru light ring", cuePos(cue), [0x4000, 0, 0]), 60, "light ring expanded");
            } else if (type === 0x06) {
                // z_demo_effect.c:1262-1280 Farore, actorCues[2] id 3: every update a DEMO_EFFECT_LGT_SHOWER (3) child 150 below;
                // the shower (alpha 255 -= 3, :1134-1144) is killed on its 86th update
                const cue = w.cue(2);
                if (!cue || cue.id !== 3) return;
                const pos = cuePos(cue);
                pos[1] -= 150;
                expire(spawnAt(0x0003, "Farore light shower", pos, null, a), 86, "light shower faded");
            } else if (type >= 0x13 && type <= 0x15) {
                // z_demo_effect.c:1558-1596 spiritual stones (child Link only), actorCues[1]: id 3/4 sparkle (Effect_Ss_KiraKira), id 6 killed
                // (the cue 3 EVENTCHKINF_OPENED_DOOR_OF_TIME write only sets an already set flag)
                if (w.flags.adult) return;
                const cue = w.cue(1);
                if (!cue) return;
                if (cue.id === 6) return w.kill(a, "cutscene cue 6");
                if (cue.id === 3) w.effect("Effect_Ss_KiraKira");
                if (cue.id === 4) {
                    // First cue 4 update only places the stone
                    if (s.split) w.effect("Effect_Ss_KiraKira");
                    s.split = true;
                }
            } else if (type === 0x16) {
                // z_demo_effect.c:1621-1645 Temple of Time dust, actorCues[2] id 2: Effect_Ss_Dust every update (func_8002873C)
                const cue = w.cue(2);
                if (cue && cue.id === 2) w.effect("Effect_Ss_Dust");
            }
            // Crystal light, triforce spot, light (0x12), getitem outside the Temple, time warps: cues only move/scale/fade them
        },
        Demo_Ext(w, a) {
            // z_demo_ext.c:101-125 actorCues[5]: id 3 -> DispellVortex, killed when alphaTimer reaches 40 (40th update after, :94-99)
            const s = (a.cueState = a.cueState || { id: 0 });
            if (s.dispelling) return;
            const cue = w.cue(5);
            if (!cue || cue.id === s.id) return;
            s.id = cue.id;
            if (cue.id === 3) {
                s.dispelling = true;
                w.afterUpdates(a, 41, () => w.kill(a, "vortex closed"));
            }
        },
        Demo_Go(w, a) {
            // z_demo_go.c:64-83 channel by params (0 -> 3, 1 -> 4, else 5); action 0 -> 1 on its first update
            const channel = a.params === 0 ? 3 : a.params === 1 ? 4 : 5;
            const s = (a.cueState = a.cueState || { action: 1 });
            const cue = w.cue(channel);
            if (!cue) return;
            // z_demo_go.c:241-247 cue 2: falls along the cue
            if (s.action === 1 && cue.id === 2) s.action = 2;
            // z_demo_go.c:249-259 lands at the cue's end frame: func_8097CA78 -> func_80033480 -> Effect_Ss_Dust
            else if (s.action === 2 && w.csFrame >= cue.end) {
                s.action = 3;
                w.effect("Effect_Ss_Dust");
            }
        },
        // Ganon's Tower collapse pieces: spawns and effects at fixed cutscene frames (cues 2/3 only switch movement, the frame work
        // runs in both update modes). Dust windows use gameplayFrames % n, so the first dust can come up to n-1 frames into a window
        Demo_Gt(w, a) {
            const f = w.csFrame;
            const statics = w.overlayStatics(a);
            // DemoGt_SpawnCloudRing (:95): Bg_Spot16_Doughnut 2-4, kept in a function static (spawned once per overlay load);
            // the ring (z_bg_spot16_doughnut.c:121-131, alpha 255 -= 5) is killed on its 51st update
            const ring = (key, params, pos) => {
                if (statics[key]) return;
                const r = w.spawn("Bg_Spot16_Doughnut", params, `tower cloud ring ${params}`, { home: { pos, rot: [0, 0, 0] } });
                statics[key] = r;
                if (r) w.afterUpdates(r, 51, () => w.kill(r, "cloud ring faded"));
            };
            const at = (dy, base) => [(base || a.home.pos)[0], (base || a.home.pos)[1] + dy, (base || a.home.pos)[2]];
            if (a.params === 0) {
                // z_demo_gt.c:540-566 Bomb2 at frames 140, 176; :516-538 dust at 220
                if (f === 140 || f === 176) w.effect("Effect_Ss_Bomb2");
                if (f === 220) w.effect("Effect_Ss_Dust");
            } else if (a.params === 1) {
                // z_demo_gt.c:725-747 cloud ring 2 at pos + 612y, frames 1060-1061
                if (f > 1059 && f < 1062) ring("ring1", 2, at(612));
                // :749-763 dust 503-580; :765-791 dust ring 583-682 (each dust 5% Effect_Ss_Kakera, near certain in the first frames); :793-807 dust > 682
                if ((f > 502 && f < 581) || f > 582) w.effect("Effect_Ss_Dust");
                if (f > 582 && f < 683) w.effect("Effect_Ss_Kakera");
                // :809-825 Bomb2 at 503
                if (f === 503) w.effect("Effect_Ss_Bomb2");
            } else if (a.params === 2) {
                // z_demo_gt.c:914-935 cloud ring 3 at pos + 247y, frames 1028-1030; :937-958 ring 4 at home + 38y, frames 998-1000
                if (f > 1027 && f < 1031) ring("ring2a", 3, at(247));
                if (f > 997 && f < 1001) ring("ring2b", 4, at(38));
                // :960-1070 dust windows 110-139, 285-420, > 704, 740-780, > 939
                if ((f > 109 && f < 140) || (f > 284 && f < 421) || f > 704) w.effect("Effect_Ss_Dust");
                // :1072-1117 Bomb2 at 58, 80, 90 and 470-480
                if (f === 58 || f === 80 || f === 90 || (f > 469 && f < 481)) w.effect("Effect_Ss_Bomb2");
                // :1119-1161 Kakera bursts at 477, 317, 740
                if (f === 317 || f === 477 || f === 740) w.effect("Effect_Ss_Kakera");
            } else if (a.params === 5) {
                // z_demo_gt.c:1229-1246,1321-1323 drawn dust at cs frames 260-288 (draw runs after curFrame++)
                if (f + 1 > 259 && f + 1 < 289) w.effect("Effect_Ss_Dust");
            } else if (a.params === 6) {
                // z_demo_gt.c:1352-1369,1440-1442 drawn dust at cs frames 856-890
                if (f + 1 > 855 && f + 1 < 891) w.effect("Effect_Ss_Dust");
            }
            // Params 7, 23, 24: sound and movement only
        },
        Demo_Ik(w, a) {
            const s = (a.cueState = a.cueState || { action: a.params <= 2 ? 0 : 3, id: 0 });
            if (a.params <= 2) {
                // Iron Knuckle armour pieces: actorCues[5/6/7] (z_demo_ik.c:90-100)
                const cue = w.cue(a.params === 0 ? 5 : a.params === 1 ? 6 : 7);
                if (!cue) return;
                // z_demo_ik.c:127-155 in action 2, cue 5: Effect_Ss_Dead_Db every update (checked before the cue handler)
                if (s.action === 2 && cue.id === 5) w.effect("Effect_Ss_Dead_Db");
                if (cue.id === s.id) return;
                s.id = cue.id;
                // z_demo_ik.c:228-239 cue 1 -> action 0, 2 -> 1, 3 -> 2, 4 killed
                if (cue.id >= 1 && cue.id <= 3) s.action = cue.id - 1;
                else if (cue.id === 4) w.kill(a, "cutscene cue 4");
            } else {
                // z_demo_ik.c:370-396 face pieces, actorCues[4]: cue 7 killed (1/5/6 only animate)
                const cue = w.cue(4);
                if (!cue || cue.id === s.id) return;
                s.id = cue.id;
                if (cue.id === 7) w.kill(a, "cutscene cue 7");
            }
        },
        // z_demo_im.c:1144 Init picks the path by params; DemoIm_GetCue z_demo_im.c:250 reads actorCues[N] (5 = Impa, 6 = medallion)
        Demo_Im(w, a) {
            const s = (a.cueState = a.cueState || { action: null });
            const c5 = w.cue(5), c6 = w.cue(6);
            const p = a.params;
            if (p === 0 || p === 1 || p > 6) {
                // Chamber of Sages (Shadow Medallion): action 0 func_8098544C z_demo_im.c:352 needs chamberCutsceneNum == SHADOW and not a cutscene layer (not tracked, see NOTES)
                if (s.action === null) { if (w.layer >= 4) return; s.action = 1; return; }
                // z_demo_im.c:365 cue5 id 2: Door_Warp1 WARP_SAGES (2) as child at her position (func_80985358 :333)
                if (s.action === 1) {
                    if (c5 && c5.id === 2) { s.action = 2; s.n = 0; w.spawn("Door_Warp1", 0x0002, "Impa's sage warp", { parent: a, home: { pos: a.home.pos.slice(), rot: [0, 0, 0] } }); }
                } else if (s.action === 2) {
                    // z_demo_im.c:382 yOffset -10000 + 83.33/Update reaches 0 on the 121st Update
                    if (++s.n >= 121) s.action = 3;
                } else if (s.action === 3) {
                    // z_demo_im.c:383 cue5 id 3: raise arms (morph 4 + 30-frame ONCE anim, done on the 34th Update)
                    if (c5 && c5.id === 3) { s.action = 4; s.n = 0; }
                } else if (s.action === 4) {
                    if (++s.n >= 34) s.action = 5;
                } else if (s.action === 5) {
                    // z_demo_im.c:400 cue6 id 2: Demo_Effect 0xD (shadow medallion) as child at Link + 80 y (func_809853B4 :342)
                    if (c6 && c6.id === 2) {
                        s.action = 6;
                        const lp = w.linkPos ? [w.linkPos[0], w.linkPos[1] + 80, w.linkPos[2]] : a.home.pos.slice();
                        w.spawn("Demo_Effect", 0x000d, "shadow medallion", { parent: a, home: { pos: lp, rot: [0, 0, 0] } });
                    }
                }
            } else if (p === 2) {
                // Sealing Ganon: z_demo_im.c:477 cue5 id 4 fades in over 10 Updates (:489), fades back out if the cue leaves 4 early
                if (s.action === null) s.action = 7;
                if (s.action === 7) {
                    if (c5 && c5.id === 4) { s.action = 8; s.n = 0; }
                } else if (s.action === 8) {
                    if (c5 && c5.id === 4) { if (++s.n >= 10) s.action = 9; }
                    else if (--s.n <= 0) { s.n = 0; s.action = 7; }
                } else if (s.action === 9) {
                    // z_demo_im.c:520 cue5 no longer 4: Demo_6K 6 (light ball) as child, once (unk_270, :459-463)
                    if (c5 && c5.id !== 4) {
                        s.action = 8;
                        if (!s.ball) { s.ball = true; w.spawn("Demo_6K", 0x0006, "Impa's light ball", { parent: a, home: { pos: [a.home.pos[0], a.home.pos[1] + 24, a.home.pos[2]], rot: [0, 0, 0] } }); }
                    }
                }
            } else if (p === 4) {
                // Hyrule Field (Impa escaping): func_8098680C z_demo_im.c:750 cue5 changes
                if (c5 && c5.id !== s.id) {
                    s.id = c5.id;
                    if (c5.id === 2) s.pos = c5.startPos.slice();
                    if (c5.id === 10) { s.throwN = 0; }
                    // z_demo_im.c:823 cue 11 kills her
                    if (c5.id === 11) return w.kill(a, "cue 11 (Demo_Im spot00)");
                } else if (s.throwN !== undefined && !s.nut) {
                    // z_demo_im.c:760-777 throw anim (30 frames, morph -8) finishes on the 30th Update: En_Arrow ARROW_CS_NUT (-10) 30 units ahead, once (unk_27C)
                    if (++s.throwN >= 30) {
                        s.nut = true;
                        const pos = s.pos || a.home.pos.slice();
                        w.spawn("En_Arrow", 0xfff6, "Impa's deku nut (ARROW_CS_NUT)", { home: { pos, rot: [0xfa0, 0, 0] } });
                    }
                }
            }
            // params 3 (courtyard lullaby), 5 (courtyard), 6 (ending): cue changes only switch animations/draw
        },
        // z_demo_kankyo.c:400-430 only the rock types read cues (actorCues[params - 2]) and only for position
        Demo_Kankyo(w, a) {
            // Door of Time opening is driven by CutsceneFlags_Get(play, 2) (z_demo_kankyo.c:318), not a cue; warp sparkles key off csCtx.state/curFrame
        },
        // z_demo_kekkai.c:175 tower barrier (params 0) on cue0 id 2: scroll rate 1 -> 7 by 0.2 (31 Updates), then 101 more Updates
        Demo_Kekkai(w, a) {
            if (a.params !== 0) return; // trial barriers (1-6) are dispelled by collision, not by a cue (see NOTES)
            const c = w.cue(0);
            const s = (a.cueState = a.cueState || { ramp: 0, timer: 0 });
            if (!c || c.id !== 2) return;
            if (s.ramp < 31) { s.ramp++; return; }
            // z_demo_kekkai.c:186-189 timer > 100: EVENTCHKINF_C3 and kill
            if (++s.timer > 100) {
                w.flags.events.add("EVENTCHKINF_C3");
                w.kill(a, "tower barrier dispelled (cue0 id 2)");
            }
        },
        // z_demo_sa.c:812 Init picks the path by params; DemoSa_GetCue z_demo_sa.c:196 (4 = Saria, 6 = medallion, 1 = bridge)
        Demo_Sa(w, a) {
            const s = (a.cueState = a.cueState || { action: null });
            const c4 = w.cue(4), c6 = w.cue(6);
            const p = a.params;
            if (p === 0 || p === 1 || p > 5) {
                // Chamber of Sages (Forest Medallion): DemoSa_CsForestMedallion_CheckCutscene z_demo_sa.c:290 needs chamberCutsceneNum == FOREST, not cutscene layer (see NOTES)
                if (s.action === null) { if (w.layer >= 4) return; s.action = 1; return; }
                if (s.action === 1) {
                    // z_demo_sa.c:306 cue4 id 2: Door_Warp1 WARP_SAGES (2) as child at her position (:272)
                    if (c4 && c4.id === 2) { s.action = 2; s.n = 0; w.spawn("Door_Warp1", 0x0002, "Saria's sage warp", { parent: a, home: { pos: a.home.pos.slice(), rot: [0, 0, 0] } }); }
                } else if (s.action === 2) {
                    if (++s.n >= 121) s.action = 3; // z_demo_sa.c:285 yOffset rise, 121 Updates
                } else if (s.action === 3) {
                    if (c4 && c4.id === 3) { s.action = 4; s.n = 0; } // z_demo_sa.c:326
                } else if (s.action === 4) {
                    if (++s.n >= 30) s.action = 5; // gSariaGiveForestMedallionAnim (morph -4) done, approx 30 Updates
                } else if (s.action === 5) {
                    // z_demo_sa.c:347 cue6 id 2: Demo_Effect 0xB (forest medallion) as child at Link + 80 y (:281)
                    if (c6 && c6.id === 2) {
                        s.action = 6;
                        const lp = w.linkPos ? [w.linkPos[0], w.linkPos[1] + 80, w.linkPos[2]] : a.home.pos.slice();
                        w.spawn("Demo_Effect", 0x000b, "forest medallion", { parent: a, home: { pos: lp, rot: [0, 0, 0] } });
                    }
                }
            } else if (p === 2) {
                // Sealing Ganon / trial: z_demo_sa.c:424 cue4 id 4 fades in over 10 Updates
                if (s.action === null) s.action = 7;
                if (s.action === 7) {
                    if (c4 && c4.id === 4) { s.action = 8; s.n = 0; }
                } else if (s.action === 8) {
                    if (c4 && c4.id === 4) { if (++s.n >= 10) s.action = 9; }
                    else if (--s.n <= 0) { s.n = 0; s.action = 7; }
                } else if (s.action === 9) {
                    // z_demo_sa.c:462 cue4 no longer 4: Demo_6K 4 (light ball) as child, once (isLightBall)
                    if (c4 && c4.id !== 4) {
                        s.action = 8;
                        if (!s.ball) { s.ball = true; w.spawn("Demo_6K", 0x0004, "Saria's light ball", { parent: a, home: { pos: [a.home.pos[0], a.home.pos[1] + 25, a.home.pos[2]], rot: [0, 0, 0] } }); }
                    }
                }
            }
            // params 3 (unused), 4 (credits, cue4 7-9), 5 (bridge, cue1 4/12-14): animation and fade only; the bridge fairy is spawned in Init
        },
        Demo_Shd(w, a) {
            // z_demo_shd.c:56-95 cue0/cue1 id 2 only set a texture scroll counter and play sequences
        },
        // z_efc_erupc.c:88-97 cue2 id 2, first time (unk_14E == 0): EVENTCHKINF_2F
        Efc_Erupc(w, a) {
            const c = w.cue(2);
            const s = (a.cueState = a.cueState || { n: 0 });
            if (!c) return;
            if (c.id === 2) {
                if (s.n === 0) w.flags.events.add("EVENTCHKINF_2F");
                s.n++;
            } else if (c.id === 3) s.n = 30;
            // particles live in the instance (EfcErupc_SpawnEffect), no heap effect
        },
        En_Ani(w, a) {
            // z_en_ani.c:249-270 cue0 ids 2/4 only change the roof man's animation (knockback, get up)
        },
        En_Du(w, a) {
            // z_en_du.c:439-500 func_809FE890 cue2 ids 1/7/8 only change Darunia's animation, face and velocity
        },
        // z_en_elf.c:873-878 Navi (FAIRY_NAVI, action func_80A03CF8) on cue8 id 5 spawns 16-life sparkles each Update
        En_Elf(w, a) {
            if (a.params !== 0) return;
            const c = w.cue(8);
            if (c && c.id === 5) w.effect("Effect_Ss_KiraKira"); // EnElf_SpawnSparkles z_en_elf.c:1228
        },
        En_Encount1(w, a) {
            // z_en_encount1.c:121 spawner only runs while csCtx.state == CS_STATE_IDLE; no cue handling
        },
        // z_en_fish.c:700-706 a dropped fish (params 0) becomes the Jabu cutscene fish when cue1 exists (overlay static sJabuCutsceneFish; no scene check)
        En_Fish(w, a) {
            const statics = w.overlayStatics(a);
            const c = w.cue(1);
            if (!statics.jabuFish && a.params === 0 && c) statics.jabuFish = a;
            if (statics.jabuFish !== a) return;
            // z_en_fish.c:597-622 cue1 gone (while playing) or id 3: clears the static and kills itself
            if (!c || c.id === 3) {
                statics.jabuFish = null;
                w.kill(a, !c ? "cue1 ended before id 3" : "cue1 id 3 (fish swallowed)");
            }
        },
        En_Fu(w, a) {
            // z_en_fu.c:165-170 EVENTCHKINF_5B is set when the Song of Storms cutscene ends (csCtx.state idle), not on a cue
        },
        En_Holl(w, a) {
            // z_en_holl.c:233 while a cutscene plays, the invisible horizontal loading planes test the camera eye instead of Link (room swaps; see NOTES)
        },
        // z_en_horse.c:2395 EnHorse_CutsceneUpdate (HORSE_PTYPE_7 cutscene horse) follows csCtx.playerCue ids 0x24-0x26, 0x40, 0x41
        En_Horse(w, a) {
            if ((a.params & 0x7fff) !== 7) return;
            const c = w.cue("player");
            if (!c) return;
            const fn = { 0x24: 1, 0x25: 2, 0x26: 3, 0x40: 4, 0x41: 5 }[c.id] || 0;
            if (!fn) return;
            // z_en_horse.c:3614-3631 galloping hooves spawn Effect_Ss_Dust (not at ENTR_LON_LON_RANCH_0 layer 9); z_en_horse.c:2240 jump landing spawns 20 Dust
            if ((fn === 1 || fn === 2 || fn === 4) && !(w.sceneName === "spot20" && w.layer === 9)) w.effect("Effect_Ss_Dust");
        },
        // z_en_ik.c:1335 EnIk_HandleCsCues (Nabooru knuckle, params & 0xFF == 0, in cutscene mode) reads actorCues[4]
        En_Ik(w, a) {
            if ((a.params & 0xff) !== 0) return;
            const s = (a.cueState = a.cueState || {});
            if (s.enemy === undefined) s.enemy = w.event("EVENTCHKINF_3B") && !w.event("EVENTCHKINF_DEFEATED_NABOORU_KNUCKLE"); // EnIk_CsInit z_en_ik.c:1515
            if (s.enemy) return;
            const c = w.cue(4);
            const toEnemy = () => { s.enemy = true; w.flags.events.add("EVENTCHKINF_3B"); }; // EnIk_ChangeToEnemy z_en_ik.c:1529
            // z_en_ik.c:1232-1241 IK_CS_ACTION_5 (cue 7): once cue4 is gone it kills itself (no switch flag outside PAL N64)
            if (s.action === 5 && !c) return w.kill(a, "armor fallen, cue4 ended");
            if (c && c.id !== s.id) {
                s.id = c.id;
                if (c.id === 3) { s.action = 2; s.n = 0; }
                else if (c.id === 4) return toEnemy();
                else if (c.id === 7) s.action = 5;
                else s.action = { 1: 0, 2: 1, 5: 3, 6: 4 }[c.id];
                return;
            }
            // z_en_ik.c:1188-1192 action 2: gIronKnuckleNabooruSummonAxeAnim (215 frames) finished with cue4 present -> enemy (215th Update)
            if (s.action === 2 && c && ++s.n >= 215) toEnemy();
        },
        En_Ishi(w, a) {
            // z_en_ishi.c:332 csCtx only widens the culling distance in Init; no cue handling
        },
        // z_en_jj.c:238-266 cue2 id 2 spawns Eff_Dust EFF_DUST_TYPE_0 as child at (-1100, 105, -27), once (unk_30A & 8)
        En_Jj(w, a) {
            if (a.params !== 0xffff) return;
            const s = (a.cueState = a.cueState || {});
            const c = w.cue(2);
            if (c) {
                if (c.id === 2 && !s.dust) s.dust = w.spawn("Eff_Dust", 0x0000, "Jabu-Jabu inhale dust", { parent: a, home: { pos: [-1100, 105, -27], rot: [0, 0, 0] } });
                return;
            }
            // z_en_jj.c:279-290 no cue: actionFunc runs; after the fish cutscene started (EnJj_RemoveDust) the dust is killed once
            if (s.dust && !s.removed && w.event("EVENTCHKINF_OPENED_JABU_JABU")) {
                s.removed = true;
                if (!s.dust.killed) w.kill(s.dust, "Jabu-Jabu removes its dust");
            }
        },
        En_Ko(w, a) {
            // z_en_ko.c:989,1133 a playing cutscene only retargets head tracking/fade to the camera eye
        },
        En_Kusa(w, a) {
            // z_en_kusa.c:249 csCtx only widens the culling distance in Init; no cue handling
        },
        En_Md(w, a) {
            // z_en_md.c:603 a playing cutscene only retargets head tracking to the camera eye
        },
        // z_en_nb.c:1473 Init picks the path by (params & 0xFF); EnNb_GetCue z_en_nb.c:255 (1 = Nabooru, 6 = medallion)
        En_Nb(w, a) {
            const s = (a.cueState = a.cueState || { action: null });
            const c1 = w.cue(1), c6 = w.cue(6);
            const t = a.params & 0xff;
            if (t < 2 || t > 6) {
                // Chamber of Sages (Spirit Medallion): EnNb_SetupChamberCsImpl z_en_nb.c:365 needs chamberCutsceneNum == SPIRIT, not cutscene layer (see NOTES)
                if (s.action === null) { if (w.layer >= 4) return; s.action = 1; return; }
                if (s.action === 1) {
                    // z_en_nb.c:383 cue1 id 2: Door_Warp1 WARP_SAGES (2) as child (:348)
                    if (c1 && c1.id === 2) { s.action = 2; s.n = 0; w.spawn("Door_Warp1", 0x0002, "Nabooru's sage warp", { parent: a, home: { pos: a.home.pos.slice(), rot: [0, 0, 0] } }); }
                } else if (s.action === 2) {
                    if (++s.n >= 121) s.action = 3;
                } else if (s.action === 3) {
                    if (c1 && c1.id === 3) { s.action = 4; s.n = 0; } // z_en_nb.c:404
                } else if (s.action === 4) {
                    if (++s.n >= 30) s.action = 5; // gNabooruRaisingArmsGivingMedallionAnim, 30 frames ONCE, morph 0
                } else if (s.action === 5) {
                    // z_en_nb.c:427 cue6 id 2: Demo_Effect 0xC (spirit medallion) as child at Link + 50 y (:357)
                    if (c6 && c6.id === 2) {
                        s.action = 6;
                        const lp = w.linkPos ? [w.linkPos[0], w.linkPos[1] + 50, w.linkPos[2]] : a.home.pos.slice();
                        w.spawn("Demo_Effect", 0x000c, "spirit medallion", { parent: a, home: { pos: lp, rot: [0, 0, 0] } });
                    }
                }
            } else if (t === 2) {
                // Sealing Ganon: z_en_nb.c:496 cue1 id 4 fades in over 10 Updates
                if (s.action === null) s.action = 7;
                if (s.action === 7) {
                    if (c1 && c1.id === 4) { s.action = 8; s.n = 0; }
                } else if (s.action === 8) {
                    if (c1 && c1.id === 4) { if (++s.n >= 10) s.action = 9; }
                    else if (--s.n <= 0) { s.n = 0; s.action = 7; }
                } else if (s.action === 9) {
                    // z_en_nb.c:536 cue1 no longer 4: Demo_6K 7 (light ball) as child, once
                    if (c1 && c1.id !== 4) {
                        s.action = 8;
                        if (!s.ball) { s.ball = true; w.spawn("Demo_6K", 0x0007, "Nabooru's light ball", { parent: a, home: { pos: [a.home.pos[0], a.home.pos[1] + 22, a.home.pos[2]], rot: [0, 0, 0] } }); }
                    }
                }
            } else if (t === 3) {
                // Kidnapped: EnNb_CheckKidnapCsMode z_en_nb.c:672 cue1 id 9 kills her
                if (c1 && c1.id !== s.id) {
                    s.id = c1.id;
                    if (c1.id === 9) w.kill(a, "cue1 id 9 (kidnapped Nabooru)");
                }
            } else if (t === 4) {
                // Knuckle confrontation: EnNb_CheckConfrontationCsMode z_en_nb.c:880
                if (s.destroyTimer !== undefined) {
                    // z_en_nb.c:969 EnNb_ConfrontationDestroy: killed once timer > 60 (61st Update); cues no longer read
                    if (++s.destroyTimer > 60) w.kill(a, "confrontation Nabooru destroyed");
                    return;
                }
                if (s.run !== undefined && !s.ball) {
                    // z_en_nb.c:957 run anim (16 frames, morph -8) finishes on the 16th Update: Demo_6K 0xB via Actor_Spawn (not child), once
                    if (++s.run >= 16) { s.ball = true; w.spawn("Demo_6K", 0x000b, "Nabooru confrontation light", { home: { pos: [(s.pos || a.home.pos)[0], (s.pos || a.home.pos)[1] + 22, (s.pos || a.home.pos)[2]], rot: [0, 0, 0] } }); }
                }
                if (c1 && c1.id !== s.id) {
                    s.id = c1.id;
                    if (c1.id === 10) s.pos = c1.startPos.slice();
                    if (c1.id === 14) s.run = s.run === undefined ? 0 : s.run;
                    if (c1.id === 9) s.destroyTimer = 0;
                }
            }
            // t === 5 (credits, cue1 15/16) and 6 (crawlspace) have no heap effect on cues
        },
        // z_en_okarina_effect.c:78-129 the storm runs on its own timer; no cue reads, nothing changes the heap on a cue
        En_Okarina_Effect(w, a) {
        },

        // z_en_owl.c:815-853 only OWL_DEFAULT (type 0) sits in EnOwl_WaitDefault and reads actorCues[7]; func_80ACBAB8 kills on cue 5
        En_Owl(w, a) {
            let owlType = (a.params >> 6) & 0x3f;
            if (a.params === 0xfff) owlType = 1;
            if (owlType !== 0) return;
            const cue = w.cue(7);
            const s = (a.cueState = a.cueState || { id: 0 });
            if (!cue || cue.id === s.id) return;
            s.id = cue.id;
            if (cue.id === 5) w.kill(a, "cue 5 on channel 7"); // z_en_owl.c:848-850
        },

        // z_en_rl.c: params 2 (light trial / sealing) = actions 4-7 on channel 0; others = Chamber of Sages actions 0-3
        En_Rl(w, a) {
            const ANIM = (last) => Math.ceil(last / 1.5) + 1; // SkelAnime_Once at 1.5 frames/update, true one update after endFrame
            const s = (a.cueState = a.cueState || { action: a.params === 2 ? 4 : 0, t: 0, ball: false, medallion: false });
            const c0 = w.cue(0);
            switch (s.action) {
                case 0: s.action = 1; break; // z_en_rl.c:166 func_80AE7798 -> func_80AE7668
                case 1: if (c0 && c0.id === 3) { s.action = 2; s.t = 0; } break; // :155-163
                case 2: if (++s.t >= ANIM(29)) s.action = 3; break; // object_rl_Anim_00040C 30 frames
                case 3: { // z_en_rl.c:132-147 Light Medallion: Demo_Effect 0xE at Link + 80y
                    const c6 = w.cue(6);
                    if (w.layer === 4 && w.sceneName === "kenjyanoma" && c6 && c6.id === 2 && !s.medallion) {
                        const p = w.linkPos || a.home.pos;
                        w.spawn("Demo_Effect", 0x0e, "Light Medallion", { home: { pos: [p[0], p[1] + 80, p[2]], rot: [0, 0, 0] } });
                        w.flags.quests.add("QUEST_MEDALLION_LIGHT");
                        s.medallion = true;
                    }
                    break;
                }
                case 4: if (c0 && c0.id === 4) { s.action = 5; s.t = 0; } break; // :218-226 fade in
                case 5: // :228-255 fade over 10 updates
                    if (c0 && c0.id === 4) { if (++s.t >= 10) { s.action = 7; s.t = 10; } }
                    else if (--s.t <= 0) { s.action = 4; s.t = 0; }
                    break;
                case 6: if (++s.anim >= ANIM(29)) s.action = 7; break; // :261-267
                case 7: // z_en_rl.c:241-258 cue 3 -> anim, any other cue than 4 -> fade out with the light ball (once)
                    if (c0 && c0.id === 3) { s.action = 6; s.anim = 0; }
                    else if (c0 && c0.id !== 4) {
                        s.action = 5; s.t = 10;
                        if (!s.ball) {
                            w.spawn("Demo_6K", 5, "Rauru light ball", { parent: a, home: { pos: [a.home.pos[0], a.home.pos[1] + 22, a.home.pos[2]], rot: [0, 0, 0] } });
                            s.ball = true;
                        }
                    }
                    break;
            }
        },

        // z_en_ru1.c: only the fountain type (1) changes the heap on cues (channel 3); the first meeting (type 2) sets its inf flag on cue 5
        En_Ru1(w, a) {
            const ANIM = (last) => Math.ceil(last / 1.5) + 1;
            const type = a.params & 0xff;
            const cue = w.cue(3);
            const s = (a.cueState = a.cueState || { step: "start", t: 0 });
            if (type === 1) {
                switch (s.step) {
                    case "start": // EnRu1_EnterFountainWater z_en_ru1.c:699-708
                        if (cue && cue.id !== 2) {
                            w.effect("Effect_Ss_G_Splash");
                            w.effect("Effect_Ss_G_Ripple");
                            s.step = "diving";
                        }
                        break;
                    case "diving": if (cue && cue.id !== 3) { s.step = "resurfacing"; s.t = 0; } break; // :710-722
                    case "resurfacing": if (++s.t >= ANIM(19)) s.step = "treading"; break; // gRutoChildResurfaceAnim 20 frames
                    case "treading": if (cue && cue.id === 6) s.step = "startBack"; break; // :738-749
                    case "startBack": if (cue && cue.id !== 6) s.step = "swimBack"; break; // :751-761
                    case "swimBack": if (cue && w.csFrame >= cue.end - 2) { s.step = "finish"; s.t = 0; } break; // :763-780
                    case "finish": // EnRu1_EndGivingSapphire z_en_ru1.c:782-786 (anim done stays true)
                        s.t++;
                        if (s.t >= ANIM(29) && cue && cue.id === 8) w.kill(a, "fountain cue 8, done swimming back");
                        break;
                }
            } else if (type === 2 && !w.inf("INFTABLE_RUTO_MET_FIRST_TIME")) {
                // z_en_ru1.c:986-1028 turn on cue 3 ... cue 5 while falling sets the flag; the kill waits for the cutscene to end (:1082-1085)
                if (cue && cue.id === 3) s.turned = true;
                if (s.turned && cue && cue.id === 5) w.flags.infs.add("INFTABLE_RUTO_MET_FIRST_TIME");
            }
        },

        // z_en_ru2.c: Chamber of Sages (default types) on channels 3/6 in gWaterMedallionCs; Water Trial (type 2) on channel 3
        En_Ru2(w, a) {
            const ANIM = (last) => Math.ceil(last / 1.5) + 1;
            const type = a.params & 0xff;
            const c3 = w.cue(3);
            if (type === 2) {
                // z_en_ru2.c:519-577 same fade/light-ball logic as En_Rl params 2
                const s = (a.cueState = a.cueState || { action: "invisible", t: 0, ball: false });
                if (s.action === "invisible") { if (c3 && c3.id === 4) { s.action = "fade"; s.t = 0; } }
                else if (s.action === "fade") {
                    if (c3 && c3.id === 4) { if (++s.t >= 10) { s.action = "visible"; s.t = 10; } }
                    else if (--s.t <= 0) { s.action = "invisible"; s.t = 0; }
                } else if (s.action === "visible" && c3 && c3.id !== 4) {
                    s.action = "fade"; s.t = 10;
                    if (!s.ball) { // EnRu2_SpawnLightBall :511-514
                        w.spawn("Demo_6K", 8, "Ruto light ball", { parent: a, home: { pos: [a.home.pos[0], a.home.pos[1] + 24, a.home.pos[2]], rot: [0, 0, 0] } });
                        s.ball = true;
                    }
                }
                return;
            }
            if (type === 3 || type === 4) return; // credits / Water Temple encounter: no cue-driven heap changes
            // EnRu2_CheckWaterMedallionCutscene z_en_ru2.c:367-381: only when chamberCutsceneNum is CHAMBER_CS_WATER, i.e. this is her own cutscene
            if (w.layer >= 4 || !(w.cs && /En_Ru2/.test(w.cs.source || ""))) return;
            const s = (a.cueState = a.cueState || { action: "awaitWarp", t: 0 });
            switch (s.action) {
                case "awaitWarp": // :383-395
                    if (c3 && c3.id === 2) {
                        w.spawn("Door_Warp1", 2, "Ruto WARP_SAGES", { parent: a, home: { pos: a.home.pos.slice(), rot: [0, 0, 0] } });
                        s.action = "rise"; s.t = 0;
                    }
                    break;
                case "rise": if (++s.t >= 120) s.action = "dialog"; break; // yOffset -10000 + 250/3 per update (:302, :400-405)
                case "dialog": if (c3 && c3.id === 3) { s.action = "raise"; s.t = 0; } break; // :410-424
                case "raise": if (++s.t >= ANIM(29)) s.action = "awaitMedallion"; break; // gAdultRutoRaisingArmsUpAnim 30 frames
                case "awaitMedallion": { // :437-449 Demo_Effect 10 at Link + 50y
                    const c6 = w.cue(6);
                    if (c6 && c6.id === 2) {
                        const p = w.linkPos || a.home.pos;
                        w.spawn("Demo_Effect", 10, "Water Medallion", { parent: a, home: { pos: [p[0], p[1] + 50, p[2]], rot: [0, 0, 0] } });
                        w.flags.quests.add("QUEST_MEDALLION_WATER");
                        s.action = "done";
                    }
                    break;
                }
            }
        },

        // z_en_sa.c:670-754 EnSa_HandleCutscene only moves and animates on actorCues[1]; Item_Give / INFTABLE come after the cutscene ends
        En_Sa(w, a) {
        },

        // z_en_tr.c: Koume (params 0) channel 3, Kotake (1) channel 2
        En_Tr(w, a) {
            const ANIM = (last) => Math.ceil(last / 1.5) + 1;
            const cue = w.cue(a.params === 0 ? 3 : 2);
            const s = (a.cueState = a.cueState || { action: "choose1", t: 0 });
            const id = cue ? cue.id : -1;
            switch (s.action) {
                case "choose1": // EnTr_ChooseAction1 z_en_tr.c:369-403
                    if (id === 1) s.action = "turn";
                    else if (id === 3) s.action = "choose2";
                    else if (id === 4) s.action = "wait";
                    else if (id === 7) s.action = "kidnap";
                    break;
                case "turn": if (id === 2) s.action = "takeoff"; break; // :350-363
                case "takeoff": if (id === 3) s.action = "choose2"; break; // :337-348
                case "choose2": // EnTr_ChooseAction2 z_en_tr.c:155-187
                    if (id === 4) { s.action = "vanish"; s.t = 24; }
                    else if (id === 6) { // :172-175 Demo_6K params+9 (magic ball) as child at her position
                        const p = cue.startPos;
                        w.spawn("Demo_6K", a.params + 9, a.params === 0 ? "Koume magic" : "Kotake magic", { parent: a, home: { pos: [p[0], p[1], p[2]], rot: [0, 0, 0] } });
                        s.action = "cast"; s.t = 0;
                    }
                    break;
                case "cast": if (++s.t >= ANIM(53)) s.action = "choose2"; break; // gKotakeKoumeCastMagicAnim 54 frames, then EnTr_Update :427-430
                case "vanish": // EnTr_ShrinkVanish :256-285: Effect_Ss_Dust (func_8002829C) at timer 4..1
                    if (s.t <= 4 && s.t > 0) w.effect("Effect_Ss_Dust");
                    if (s.t === 0) s.action = "wait";
                    else s.t--;
                    break;
                case "wait": if (id === 3 || id === 5) { s.action = "reappear"; s.t = 34; } break; // :306-320
                case "reappear": // EnTr_Reappear :287-304: dust while timer >= 31
                    if (s.t >= 31) w.effect("Effect_Ss_Dust");
                    if (s.t === 0) s.action = "choose2";
                    else s.t--;
                    break;
            }
        },

        // z_en_viewer.c:228-237, 377-387 frame-driven spawns inside EnViewer_UpdateImpl (after its objects load)
        En_Viewer(w, a) {
            const type = (a.params >> 8) & 0xff;
            if (type === 3 && w.layer === 5 && w.csFrame === 1545) {
                w.spawn("Demo_6K", 0x0c, "Ganondorf magic ball", { parent: a, home: { pos: [32, 101, 1226], rot: [0, 0, 0] } });
            } else if (type === 1) { // Impa: the Ocarina of Time thrown / held
                if (w.layer === 5 && w.csFrame === 845) w.spawn("Item_Ocarina", 0, "Ocarina of Time", { parent: a, home: { pos: [4, 81, 2600], rot: [0, 0, 0] } });
                else if (w.layer !== 5 && w.csFrame === 195) w.spawn("Item_Ocarina", 1, "Ocarina of Time", { parent: a, home: { pos: [4, 81, 2035], rot: [0, 0, 0] } });
            }
        },

        // z_en_xc.c Sheik: harp/nut chain (actions 6-19, mirrored at 31-44 and 65-78), flame (DMC), Lake Hylia, Triforce, Nocturne; channel 4 unless noted
        En_Xc(w, a) {
            const ANIM = (last) => Math.ceil(last / 1.5) + 1;
            const p = a.params;
            const c4 = w.cue(4);
            const id4 = c4 ? c4.id : -1;
            const st = w.overlayStatics(a);
            const dist = (x, y) => (x && y ? Math.hypot(x[0] - y[0], x[2] - y[2]) : null);
            let s = a.cueState;
            if (!s) {
                // starting action per type (EnXc_Init z_en_xc.c:2363-2409), assuming the song cutscene has already been triggered
                let chain = "none";
                if (p === 6 || p === 7) chain = "fall";
                else if (p === 8 || p === 2) chain = "serenade";
                else if (p === 9) chain = (w.event("EVENTCHKINF_C5") && w.event("EVENTCHKINF_48") && !w.event("EVENTCHKINF_55")) ? "serenade" : "none";
                else if (p === 3) chain = "lake";
                else if (p === 4) chain = "triforce";
                else if (p === 5) chain = "nocturne";
                s = a.cueState = { step: chain === "fall" ? "waitFall" : chain === "serenade" ? "posFromCue" : chain === "lake" ? "lakeWait" : chain === "triforce" ? "triWait" : chain === "nocturne" ? "noct" : "none", t: 0, pos: a.home.pos.slice() };
                if (st.flameCue === undefined) { st.flameCue = 1; st.flameSpawned = false; st.lakeCue = 1; }
            }
            // EnXc_InitFlame z_en_xc.c:538-584 (Death Mountain Crater only), shared statics sFlameSpawned / D_80B41DA8
            const flame = () => {
                if (w.sceneName !== "spot17") return;
                const c0 = w.cue(0);
                if (!c0 || c0.id === st.flameCue) return;
                if (c0.id !== 1 && !st.flameSpawned) {
                    s.flame = w.spawn("En_Light", 5, "Bolero flame", { home: { pos: c0.startPos.slice(), rot: [0, 0, 0] } });
                    st.flameSpawned = true;
                }
                st.flameCue = c0.id;
                if (c0.id === 1) {
                    if (s.flame) w.kill(s.flame, "Sheik's flame destroyed");
                    s.flame = null;
                    w.kill(a, "Bolero cue 1 on channel 0");
                }
            };
            const toward = () => dist(s.pos, w.linkPos);
            switch (s.step) {
                // --- Minuet / Bolero intro (actions 1-5) ---
                case "waitFall": // EnXc_SetupFallFromSkyAction :763-786
                    if (id4 === 2) { s.step = "fall"; s.t = 0; s.pos = c4.startPos.slice(); }
                    break;
                case "fall": if (++s.t >= ANIM(64)) { s.step = "walk"; s.t = 0; } break; // gSheikFallingFromSkyAnim 65 frames
                case "walk": { // accel 12 updates (:807), walk until xzDistToPlayer <= 95 (:814-824), stop 12 (:826-833)
                    const d = toward();
                    const walk = d === null ? 0 : Math.max(0, Math.ceil((d - 95 - 3.6) / 1.2));
                    if (++s.t >= 12 + walk + 12) { s.step = "waitHarp"; s.d0 = 92.6; }
                    break;
                }
                // --- Serenade / Prelude start (actions 30, EnXc_ActionFunc21 :1137-1158) ---
                case "posFromCue":
                    if (c4 && id4 !== 1) { s.step = "waitHarp"; s.pos = c4.startPos.slice(); s.d0 = toward(); }
                    break;
                // --- harp and nut chain (actions 6-19) ---
                case "waitHarp": // func_80B3DAF0 :836-851
                    if ([3, 11, 12, 13, 23].includes(id4)) { s.step = "pullOut"; s.t = 0; }
                    break;
                case "pullOut": if (++s.t >= ANIM(57)) { s.step = "initHarp"; s.t = 0; } break; // gSheikPullingOutHarpAnim 58
                case "initHarp": if (++s.t >= ANIM(16)) s.step = "playing"; break; // gSheikInitialHarpAnim 17
                case "playing": if (id4 === 8) s.step = "harpHold"; break; // func_80B3DCA8 :883-896
                case "harpHold": // EnXc_SetupHarpPutawayAction :898-915
                    if (id4 === 5) { s.step = "putAway"; s.t = 0; }
                    else if (c4 && id4 !== 8) s.step = "playing";
                    break;
                case "putAway": if (++s.t >= ANIM(16)) { s.step = "pushIn"; s.t = 0; } break;
                case "pushIn": if (++s.t >= ANIM(57)) s.step = "idle"; break;
                case "idle": // EnXc_ActionFunc13 :1041-1047
                    flame();
                    if (id4 === 4) { s.step = "revAccel"; s.t = 0; }
                    break;
                case "revAccel": // :947-953 12 updates, 3.6 units covered
                    if (s.step === "revAccel" && p !== 5) flame();
                    if (++s.t >= 12) {
                        const d0 = s.d0 === null || s.d0 === undefined ? 92.6 : s.d0;
                        s.step = "revWalk"; s.t = 0; s.walkN = Math.max(1, Math.ceil((140 - d0 - 3.6) / 1.2) + 1);
                    }
                    break;
                case "revWalk": // walk away until xzDistToPlayer >= 140 (:955-964, :1307-1316, :1982-1991)
                    if (p !== 5) flame();
                    if (++s.t >= s.walkN) { s.step = "halt"; s.t = 0; }
                    break;
                case "halt": flame(); if (++s.t >= 12) { s.step = "throw"; s.t = 0; } break; // EnXc_SetupNutThrow :966-975
                case "throw": // func_80B3E164 :977-982 deku nut En_Arrow ARROW_CS_NUT (-10)
                    flame();
                    if (++s.t >= 30) {
                        w.spawn("En_Arrow", 0xfff6, "Sheik's deku nut", { home: { pos: s.pos.slice(), rot: [0xfa0, 0, 0] } });
                        s.step = "delete";
                    }
                    break;
                case "delete": // EnXc_SetupDisappear :984-1002
                    flame();
                    if (id4 === 9) {
                        if (w.sceneName === "spot17") s.step = "fade";
                        else w.kill(a, "cue 9: Sheik vanishes");
                    }
                    break;
                case "fade": flame(); break; // EnXc_Fade :1082
                // --- Lake Hylia (actions 45-52) ---
                case "lakeWait": if (c4 && id4 !== 1) s.step = "lake47"; break;
                case "lake47": // EnXc_ActionFunc47 :1498-1504, func_80B3F534 :1466-1472 warp on frame 310
                    if (w.csFrame === 310) w.spawn("Door_Warp1", 6, "Lake Hylia WARP_DESTINATION", { home: { pos: [-1044, -1243, 7458], rot: [0, 0, 0] } });
                    if (id4 === 4) { s.step = "lakeWalk"; }
                    break;
                case "lakeWalk": // then kneel on cue 16 (:1484-1489); from the kneel on, func_80B3F59C reads channel 0
                    if (id4 === 16) s.step = "lakeKneel";
                    break;
                case "lakeKneel": { // func_80B3F59C :1474-1494: cue 3 on channel 0 -> EnXc_LakeHyliaDive ripples + splash
                    const c0 = w.cue(0);
                    if (c0 && c0.id !== st.lakeCue) {
                        if (c0.id === 3) { w.effect("Effect_Ss_G_Ripple"); w.effect("Effect_Ss_G_Splash"); }
                        st.lakeCue = c0.id;
                    }
                    break;
                }
                // --- Triforce reveal (actions 53-56) ---
                case "triWait": if (c4 && id4 !== 1) s.step = "tri54"; break; // func_80B3FF0C :1640-1663
                case "tri54": if (id4 === 10) { s.step = "triShow"; s.t = 0; } break; // :1665-1672
                case "triShow": if (++s.t >= ANIM(49)) s.step = "triIdle"; break; // gSheikShowingTriforceOnHandAnim 50
                case "triIdle": if (id4 === 9) w.kill(a, "cue 9 after the Triforce"); break; // func_80B400AC :1682-1686
                // --- Nocturne (EnXc_SetupNocturneState :2005-2056) ---
                case "noct":
                    if (c4 && id4 !== s.lastId) {
                        s.lastId = id4;
                        if (id4 === 9) w.kill(a, "Nocturne cue 9");
                        else if (id4 === 17) { s.step = "waitHarp"; s.pos = c4.startPos.slice(); s.d0 = toward(); }
                    }
                    break;
            }
        },

        // z_en_zl1.c:384-432 cue 0 only drives position and animation; the letter and flag come from dialogue after the cutscene
        En_Zl1(w, a) {
        },

        // z_en_zl2.c: params 1 = ending (func_80B51948), 4 = running (func_80B51FA8), others = Temple of Time light arrows (func_80B50A04); channel 0
        En_Zl2(w, a) {
            const ANIM = (last) => Math.ceil(last / 1.5) + 1;
            const cue = w.cue(0);
            const s = (a.cueState = a.cueState || { id: 0, action: a.params === 1 ? "ending" : a.params === 4 ? "running" : "tot", t: 0, wait: 0 });
            const pos = () => (cue ? cue.startPos.slice() : a.home.pos.slice());
            if (s.action === "ending") {
                if (!cue || cue.id === s.id) return;
                s.id = cue.id;
                if (cue.id === 21 && !s.warp) { // func_80B513A8 z_en_zl2.c:1210-1225 WARP_UNK_7 at Link
                    w.spawn("Door_Warp1", 7, "Zelda ending warp", { home: { pos: (w.linkPos || a.home.pos).slice(), rot: [0, 0, 0] } });
                    s.warp = true;
                }
                return;
            }
            if (s.action === "running") {
                if (s.step === "run") { if (cue && w.csFrame > cue.end) w.kill(a, "running cue over"); return; } // func_80B51DA4 :1500-1511
                if (!cue || cue.id === s.id) return;
                s.id = cue.id;
                if (cue.id === 14) w.kill(a, "running cue 14"); // :1561-1562
                else if (cue.id === 2) s.step = "run";
                return;
            }
            // Temple of Time: anim / frame waits (actions 3,5,7,9,14,16,18,20,23) don't read new cues
            if (s.wait > 0) { s.wait--; return; }
            if (s.step === "waitEnd") { if (cue && w.csFrame >= cue.end) s.step = null; else return; } // func_80B503DC :793-800
            if (s.step === "waitEnd24") { if (cue && w.csFrame >= cue.end) s.step = "final"; return; } // func_80B509A0 :936-946
            if (s.step === "final") { // func_80B51310 :1195-1204 no cue: kill the crystal child and herself
                if (!cue) { if (s.crystal) w.kill(s.crystal, "Zelda's crystal"); w.kill(a, "cue 0 gone"); }
                return;
            }
            if (!cue || cue.id === s.id) return;
            s.id = cue.id;
            switch (cue.id) {
                case 3: s.step = "waitEnd"; break;
                case 4: s.wait = ANIM(29); break; // gZelda2Anime1Anim_0022D0 30
                case 5: s.wait = ANIM(14); break; // _00325C 15
                case 6: s.wait = ANIM(29); break; // _000A50 30
                case 7: // EnZl2_GiveLightArrows :654-669 Demo_Effect 0x17 at Link + 80y
                    if (!s.arrows) {
                        const p = w.linkPos || a.home.pos;
                        w.spawn("Demo_Effect", 0x17, "Light Arrows", { home: { pos: [p[0], p[1] + 80, p[2]], rot: [0, 0, 0] } });
                        w.flags.items.add("ITEM_ARROW_LIGHT");
                        s.arrows = true;
                    }
                    break;
                case 9: s.wait = ANIM(14); break; // _00AAD4 15
                case 10: // func_80B4FFF0 :686-700 WARP_PURPLE_CRYSTAL child, pos - 26y
                    if (!s.crystal) {
                        const p = pos();
                        s.crystal = w.spawn("Door_Warp1", 3, "Zelda's crystal", { parent: a, home: { pos: [p[0], p[1] - 26, p[2]], rot: [0, 0x4000, 0] } });
                    }
                    s.wait = ANIM(9); // _001670 10
                    break;
                case 11: s.wait = ANIM(19); break; // _002B14 20
                case 12: s.wait = ANIM(4); break; // _001010 5
                case 14: s.step = "waitEnd24"; break;
                case 15: // func_80B4FF84 :671-684 WARP_YELLOW at her position
                    if (!s.yellow) {
                        w.spawn("Door_Warp1", 4, "Zelda yellow warp", { home: { pos: pos(), rot: [0, 0, 0] } });
                        s.yellow = true;
                    }
                    break;
            }
        },

        // z_en_zl4.c:1238-1273 castle courtyard cue 0 only moves / animates; the letter and flag come from dialogue
        En_Zl4(w, a) {
        },

        // z_item_etcetera.c:222-237 fire arrow (type 7) waits for cue 2 on channel 0 (or no cue) and then falls, sparkling while airborne
        Item_Etcetera(w, a) {
            if ((a.params & 0xff) !== 7) return;
            const s = (a.cueState = a.cueState || {});
            if (s.falling) return;
            const cue = w.cue(0);
            if (!cue || cue.id === 2) { s.falling = true; w.effect("Effect_Ss_KiraKira"); } // ItemEtcetera_SpawnSparkles :190-205
        },

        // z_obj_dekujr.c:103-150 cue 1 only moves the Deku Sprout
        Obj_Dekujr(w, a) {
        },

        // z_obj_hamishi.c:150-160 a cutscene only widens the culling distance at Init; no cue reads
        Obj_Hamishi(w, a) {
        },

        // z_obj_mure2.c:220-229 csCtx.state (not a cue) doubles the spawn / remove range; no cue reads
        Obj_Mure2(w, a) {
        },

        // z_object_kankyo.c:743-925 lightning / sun grave spark / trial beams only change drawing state on cues
        Object_Kankyo(w, a) {
        },

        // z_player.c:16017-16049 func_80852C50: a new playerCue maps through sCueToCsActionMap (:11586) and runs that csAction's init, then its update
        Player(w, a) {
            const cue = w.cue("player");
            const s = (a.cueState = a.cueState || { id: 0 });
            if (cue && cue.id !== s.id) {
                s.id = cue.id;
                if (cue.id === 71) { // PLAYER_CSACTION_89 func_808524B0 -> func_80837704 -> func_80837530 :4353-4357 spin charge
                    const sword = w.flags.adult ? 2 : 1; // Player_GetMeleeWeaponHeld
                    w.spawn("En_M_Thunder", sword | 0x200, "cutscene spin attack", { parent: a, home: { pos: (w.linkPos || a.home.pos).slice(), rot: [0, 0, 0] } });
                }
            }
            // PLAYER_CSACTION_70 / 72 (cues 62 / 66) func_808526EC :15913-15930 KiraKira sparkles every update (after the first)
            if (s.id === 62 || s.id === 66) {
                s.sparkle = (s.sparkle || 0) + 1;
                if (s.sparkle >= 2) w.effect("Effect_Ss_KiraKira");
            } else s.sparkle = 0;
        },
    };

    // Player actions that leave code or effects in the heap for the rest of the scene
    const ACTIONS = {
        // z_arms_hook.c: persistent code, the instance goes when the hookshot is put away
        hookshot: (w) => w.spawnAndRemove("Arms_Hook", 0, "hookshot put away"),
        // z_en_m_thunder.c:102-109 a quick spin without magic loads the persistent code, then Init kills it
        quickSpin: (w) => w.spawnAndRemove("En_M_Thunder", 1, "no magic"),
        // z_en_bom.c: a bomb's fuse sparks, then Bomb2 and Blast
        bomb: (w) => {
            w.spawnAndRemove("En_Bom", 0, "explodes");
            w.effect("Effect_Ss_G_Spk");
            w.effect("Effect_Ss_Bomb2");
            w.effect("Effect_Ss_Blast");
        },
        arrow: (w) => w.spawnAndRemove("En_Arrow", 0, "arrow gone"),
        // z_message.c: a known song spawns an Oceff actor, which uses the absolute code space
        song: (w) => w.spawnAndRemove("Oceff_Wipe", 0, "song effect ends"),
        // z_collision_check.c: a sword hitting something solid
        hitSolid: (w) => w.effect("Effect_Ss_HitMark"),
        // z_en_kusa.c: cutting grass or breaking a crate
        cutGrass: (w) => w.effect("Effect_Ss_Kakera"),
        // z_player.c: rolling on dirt
        roll: (w) => w.effect("Effect_Ss_Dust"),
    };
    const ACTION_LABELS = {
        hookshot: "Use the hookshot",
        quickSpin: "Quick spin with no magic",
        bomb: "A bomb explodes",
        arrow: "Shoot an arrow",
        song: "Play a known song",
        hitSolid: "Sword hits something solid",
        cutGrass: "Cut grass / break a crate",
        roll: "Roll on dirt",
    };

    // Flags shown by name in the game state panel; anything else the rules read is listed under "Other"
    // Story flags that change what loads: every flag an actor rule or scene load reads, with what it changes
    const FLAGS = [
        { group: "Kokiri Forest and the Deku Tree", id: "EVENTCHKINF_OBTAINED_ZELDAS_LETTER", label: "Met Zelda (has Zelda's Letter)", note: "Mido leaves Kokiri Forest for his house, the type 2 bushes go, and Saria and the owls move on." },
        { group: "Kokiri Forest and the Deku Tree", id: "EVENTCHKINF_1C", label: "Mido has moved (showed him the sword and shield)", note: "Mido leaves Kokiri Forest for his house." },
        { group: "Kokiri Forest and the Deku Tree", id: "EVENTCHKINF_0C", label: "Deku Tree met (intro watched, said no)", note: "Z-targeting the Deku Tree then asks again instead of the first meeting." },
        { group: "Kokiri Forest and the Deku Tree", id: "EVENTCHKINF_05", label: "Said yes to the Deku Tree" },
        { group: "Kokiri Forest and the Deku Tree", id: "EVENTCHKINF_09", label: "Gohma defeated (Deku Tree blue warp taken)", note: "Set with EVENTCHKINF_07 by the Deku Tree warp. With King Dodongo and Barinade beaten too, child Zelda (En_Zl1) goes." },
        { group: "Kokiri Forest and the Deku Tree", id: "QUEST_KOKIRI_EMERALD", kind: "quest", label: "Has the Kokiri Emerald", note: "Saria is no longer in Kokiri Forest." },
        { group: "Kokiri Forest and the Deku Tree", id: "ITEM_OCARINA_FAIRY", kind: "item", label: "Fairy Ocarina in the ocarina slot", note: "Saria in her house (child, before Zelda's Letter)." },
        { group: "Kokiri Forest and the Deku Tree", id: "EVENTCHKINF_C1", label: "Got the Fairy Ocarina on the bridge", note: "Until set, the Lost Woods bridge entrance plays Saria's farewell cutscene (cutscene layer) instead." },
        { group: "Kokiri Forest and the Deku Tree", id: "QUEST_MEDALLION_FOREST", kind: "quest", label: "Has the Forest Medallion", note: "The Deku Tree Sprout appears and the adult Kokiri come back." },
        { group: "Kokiri Forest and the Deku Tree", id: "EVENTCHKINF_48", label: "Forest Temple beaten (blue warp taken)", note: "Adult Kokiri Forest loads layer 3 instead of 2. One of the three weather checks." },
        { group: "Kokiri Forest and the Deku Tree", id: "ITEM_ODD_POTION", kind: "item", label: "Holding the Odd Potion (adult trade)", note: "The Kokiri girl in the Lost Woods stays." },
        { group: "Hyrule Castle and Market", id: "EVENTCHKINF_ZELDA_FLED_CASTLE", label: "Zelda fled the castle (Ocarina of Time thrown)", note: "The Ocarina of Time lies in the moat, and the castle guards and Impa's Zelda cutscene change." },
        { group: "Hyrule Castle and Market", id: "EVENTCHKINF_43", label: "Got the Ocarina of Time", note: "Removes the moat ocarina and the Lake Hylia owl on the Gerudo side." },
        { group: "Hyrule Castle and Market", id: "EVENTCHKINF_OPENED_DOOR_OF_TIME", label: "Door of Time opened", note: "The Door of Time collision and its light go." },
        { group: "Hyrule Castle and Market", id: "EVENTCHKINF_OBTAINED_MASTER_SWORD", label: "Pulled the Master Sword", note: "The dying market guard goes and the castle soldiers change." },
        { group: "Hyrule Castle and Market", id: "INFTABLE_76", label: "Showed Zelda's Letter to the Kakariko gate guard", note: "Opens the Happy Mask Shop and removes the gate guest." },
        { group: "Hyrule Castle and Market", id: "EVENTCHKINF_25", label: "King Dodongo defeated (Dodongo's Cavern blue warp taken)", note: "Opens the Bombchu Shop. One of the three for child Zelda leaving." },
        { group: "Hyrule Castle and Market", id: "ITEMGETINF_1B", label: "Won the Treasure Chest Game heart piece", note: "The chest game's last room gives a rupee instead." },
        { group: "Lon Lon Ranch", id: "INFTABLE_MALON_SPAWNED_AT_HYRULE_CASTLE", label: "Malon met outside Hyrule Castle", note: "Malon moves from the market to the castle." },
        { group: "Lon Lon Ranch", id: "EVENTCHKINF_TALON_RETURNED_FROM_CASTLE", label: "Talon woken and back at the ranch", note: "Malon, Talon, Ingo and child Epona move to their ranch places." },
        { group: "Lon Lon Ranch", id: "EVENTCHKINF_TALON_RETURNED_FROM_KAKARIKO", label: "Adult Talon back at the ranch (from Kakariko)", note: "Talon and his super cuccos move from Kakariko to the ranch." },
        { group: "Lon Lon Ranch", id: "EVENTCHKINF_EPONA_OBTAINED", label: "Epona obtained", note: "The ranch gate, Link's house cow check and the cloudy weather change, and the Hyrule Field fence-jump cutscenes play." },
        { group: "Lon Lon Ranch", id: "EVENTCHKINF_HORSE_RACE_COW_UNLOCK", label: "Won the cow in Ingo's race", note: "A cow and cuccos appear in Link's house." },
        { group: "Kakariko and the Graveyard", id: "EVENTCHKINF_1D", label: "Opened the Royal Family's Tomb", note: "The tomb headstone stays blown open and the grave's song tag goes." },
        { group: "Kakariko and the Graveyard", id: "EVENTCHKINF_54", label: "Learned the Nocturne of Shadow", note: "The well's post goes for adult Link." },
        { group: "Kakariko and the Graveyard", id: "EVENTCHKINF_AA", label: "Watched adult Kakariko's Sheik cutscene", note: "Until set, adult Kakariko after the Forest, Fire and Water Temples plays the Nocturne cutscene (cutscene layer)." },
        { group: "Kakariko and the Graveyard", id: "ITEMGETINF_30", label: "Gave the Odd Potion to Granny", note: "Grog in the Lost Woods is gone as adult." },
        { group: "Death Mountain", id: "QUEST_GORON_RUBY", kind: "quest", label: "Has the Goron Ruby", note: "The Goron in the market Bazaar appears." },
        { group: "Death Mountain", id: "QUEST_MEDALLION_FIRE", kind: "quest", label: "Has the Fire Medallion", note: "Adult Gorons return to Goron City." },
        { group: "Death Mountain", id: "EVENTCHKINF_49", label: "Fire Temple beaten (blue warp taken)", note: "Death Mountain clears up and stops dropping rocks. One of the three weather checks." },
        { group: "Death Mountain", id: "INFTABLE_11A", label: "Darunia ran into the Fire Temple", note: "Adult Darunia at the Fire Temple entrance is gone." },
        { group: "Zora's Domain and Lake Hylia", id: "EVENTCHKINF_39", label: "Opened the waterfall to Zora's Domain", note: "The Zora's River owl goes." },
        { group: "Zora's Domain and Lake Hylia", id: "EVENTCHKINF_31", label: "Took Ruto's Letter at Lake Hylia", note: "The bottle at the bottom of the lake goes." },
        { group: "Zora's Domain and Lake Hylia", id: "INFTABLE_RUTO_MET_FIRST_TIME", label: "Met Ruto in Jabu-Jabu", note: "Which Ruto spawns where in Jabu-Jabu's Belly." },
        { group: "Zora's Domain and Lake Hylia", id: "INFTABLE_RUTO_BROUGHT_BACK_TO_HOLES_ROOM", label: "Carried Ruto back to the holes room" },
        { group: "Zora's Domain and Lake Hylia", id: "INFTABLE_RUTO_PLACED_ON_SWITCH", label: "Put Ruto on the switch" },
        { group: "Zora's Domain and Lake Hylia", id: "INFTABLE_RUTO_HAS_SAPPHIRE", label: "Ruto has the Zora's Sapphire", note: "The sapphire's sparkle actor goes." },
        { group: "Zora's Domain and Lake Hylia", id: "INFTABLE_RUTO_ABDUCTED", label: "Ruto carried off by the Big Octo", note: "The Big Octo platform spawns the Big Octo." },
        { group: "Zora's Domain and Lake Hylia", id: "EVENTCHKINF_BEGAN_BARINADE_BATTLE", label: "Started the Barinade fight", note: "Barinade spawns its Bari on load." },
        { group: "Zora's Domain and Lake Hylia", id: "EVENTCHKINF_37", label: "Barinade defeated (Jabu-Jabu blue warp taken)", note: "Barinade's room gives a blue warp instead of Ruto, and throne-room Ruto appears. One of the three for child Zelda leaving." },
        { group: "Zora's Domain and Lake Hylia", id: "INFTABLE_138", label: "Thawed King Zora", note: "Adult King Zora's ice block goes." },
        { group: "Zora's Domain and Lake Hylia", id: "EVENTCHKINF_4A", label: "Water Temple beaten (blue warp taken)", note: "Zora's Domain thaws and Lake Hylia's rain stops. One of the three weather checks." },
        { group: "Gerudo and the Desert", id: "EVENTCHKINF_CARPENTER_0_RESCUED", label: "Rescued carpenter 1" },
        { group: "Gerudo and the Desert", id: "EVENTCHKINF_CARPENTER_1_RESCUED", label: "Rescued carpenter 2" },
        { group: "Gerudo and the Desert", id: "EVENTCHKINF_CARPENTER_2_RESCUED", label: "Rescued carpenter 3" },
        { group: "Gerudo and the Desert", id: "EVENTCHKINF_CARPENTER_3_RESCUED", label: "Rescued carpenter 4", note: "With all four, the Gerudo Valley bridge is repaired." },
        { group: "Gerudo and the Desert", id: "EVENTCHKINF_GERUDO_CAUGHT_TOWER_FALL", label: "Caught by the Gerudo once", note: "Until set, getting caught (or the tower collapse) plays the first-capture cutscene." },
        { group: "Gerudo and the Desert", id: "ITEM_BOW", kind: "item", label: "Has the Fairy Bow", note: "The horseback archery Gerudo stays." },
        { group: "Gerudo and the Desert", id: "EVENTCHKINF_AC", label: "Watched the Desert Colossus arrival", note: "Until set, entering from the Haunted Wasteland plays the Colossus cutscene (cutscene layer)." },
        { group: "Gerudo and the Desert", id: "EVENTCHKINF_95", label: "Met Nabooru in the Spirit Temple crawlspace", note: "Crawlspace Nabooru goes." },
        { group: "Gerudo and the Desert", id: "EVENTCHKINF_DEFEATED_NABOORU_KNUCKLE", label: "Defeated Nabooru's Iron Knuckle" },
        { group: "Sages and Ganon", id: "EVENTCHKINF_50", label: "Learned the Minuet of Forest", note: "Sheik in Sacred Forest Meadow goes." },
        { group: "Sages and Ganon", id: "QUEST_MEDALLION_SHADOW", kind: "quest", label: "Has the Shadow Medallion" },
        { group: "Sages and Ganon", id: "EVENTCHKINF_C4", label: "Watched the light arrows cutscene", note: "Until set, entering the Temple of Time as adult with the Spirit and Shadow Medallions plays it (cutscene index 8)." },
        { group: "Sages and Ganon", id: "EVENTCHKINF_BEGAN_GANONDORF_BATTLE", label: "Started the Ganondorf fight", note: "Ganondorf only spawns Zelda for his intro before this is set." },
        { group: "Songs", id: "QUEST_SONG_LULLABY", kind: "quest", label: "Zelda's Lullaby", note: "Changes the Lost Woods owl and the Saria's Song sound." },
        { group: "Songs", id: "QUEST_SONG_SARIA", kind: "quest", label: "Saria's Song" },
        { group: "Songs", id: "QUEST_SONG_MINUET", kind: "quest", label: "Minuet of Forest" },
        { group: "Upgrades", id: "INFTABLE_HAS_DEKU_STICK_UPGRADE", label: "Deku stick upgrade bought", note: "The Lost Woods scrub selling it goes." },
        { group: "Upgrades", id: "INFTABLE_HAS_DEKU_NUT_UPGRADE", label: "Deku nut upgrade bought", note: "The Lost Woods scrub selling it goes." },
        { group: "Upgrades", id: "ITEMGETINF_DEKU_HEART_PIECE", label: "Got the Deku scrub heart piece" },
    ];

    const ITEM00_NAMES = ["green rupee", "blue rupee", "red rupee", "recovery heart", "bombs", "arrow", "heart piece", "heart container",
        "arrows (5)", "arrows (10)", "arrows (30)", "bombs", "Deku nut", "Deku stick", "magic (large)", "magic (small)", "Deku seeds",
        "small key", "flexible", "gold rupee", "purple rupee"];

    // Scene flags the game state panel offers: collectibles, chests, switches and cleared rooms found in each scene's actor lists
    const SWITCH_ACTORS = {
        En_Wonder_Item: (p) => p & 0x3f, Obj_Bombiwa: (p) => p & 0x3f, Obj_Hamishi: (p) => p & 0x3f, Bg_Breakwall: (p) => p & 0x3f,
        Bg_Ydan_Sp: (p) => p & 0x3f, Obj_Mure3: (p) => p & 0x3f, Obj_Lift: (p) => (p >> 2) & 0x3f, En_Okarina_Tag: (p) => p & 0x3f,
        En_Wonder_Talk: (p) => p & 0x3f, En_Wonder_Talk2: (p) => p & 0x3f, Obj_Bean: (p) => p & 0x3f,
        En_Ishi: (p) => (p & 1 ? ((p >> 10) & 0x3c) | ((p >> 6) & 3) : 0x3f),
    };
    function sceneFlagList(data, sceneName) {
        const scene = data.sceneData[sceneName];
        const seen = new Map();
        const add = (kind, flag, label) => {
            const key = `${kind}:${flag}`;
            if (!seen.has(key)) seen.set(key, { kind, flag, label });
        };
        for (const layer of ["0", "1", "2", "3"]) {
            const rooms = scene.layers[layer] ? scene.layers[layer].rooms : [];
            rooms.forEach((room, number) => {
                for (const [id, x, y, z, , , , params] of room.actors) {
                    const actor = data.actors[id & 0x1fff];
                    if (!actor) continue;
                    const where = `room ${number} (${x}, ${y}, ${z})`;
                    if (actor.name === "En_Item00") {
                        const flag = (params >> 8) & 0x3f;
                        if (flag && flag < 0x20) add("collectibles", flag, `Collected the ${ITEM00_NAMES[params & 0xff] || "item"} in ${where}`);
                    } else if (actor.name === "En_Box") {
                        add("chests", params & 0x1f, `Opened the chest in ${where}`);
                    } else if (SWITCH_ACTORS[actor.name]) {
                        const flag = SWITCH_ACTORS[actor.name](params);
                        if (flag !== 0x3f && flag < 0x38) add("switches", flag, `Switch ${Sim.hex(flag, 2)} (${actor.name} in ${where})`);
                    }
                }
            });
        }
        const list = [...seen.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.flag - b.flag);
        if (sceneName === "ydan_boss") list.unshift({ kind: "clears", flag: 0, label: "Gohma defeated" });
        return list;
    }

    const ACTOR_FLAG_ATTENTION_ENABLED = 1 << 0;
    const ACTOR_FLAG_SFX_ACTOR_POS_2 = 1 << 19;
    const CAT_MISC = 8;
    const CS_TREEMOUTH = { meeting: 0x8f0, choice: 0xd70, yes: 0xff0, no: 0x1260 };

    const link = (w) => (w.linkPos ? w.linkPos.slice() : [0, 0, 0]);
    const pick = (w, name, which, keep = () => true) => {
        const list = w.live(name).filter((a) => !a.killed && keep(a));
        if (!list.length) throw new Sim.SimError(`there is no ${name} here`);
        if (which === undefined || which === "") return list[list.length - 1];
        const found = list.find((a) => a.tag === which || Sim.addr(a.instance) === String(which).toUpperCase());
        if (!found) throw new Sim.SimError(`no ${name} matches ${which}`);
        return found;
    };
    const heldChu = (w) => w.live("En_Bom_Chu").find((a) => a.held && !a.killed);

    // Route steps for the actions wrong-warp setups use, following the runtime audit of each actor
    const STEPS = {
        linkAt: {
            label: "Link moves to a position",
            help: "Where Link stands decides what spawns near him and where held items start.",
            params: [
                { key: "x", type: "number", label: "X", default: 0 },
                { key: "y", type: "number", label: "Y", default: 0 },
                { key: "z", type: "number", label: "Z", default: 0 },
                { key: "angle", type: "hex", label: "Facing angle (blank = unchanged)", default: "" },
            ],
            run(w, p) {
                w.linkPos = [Number(p.x), Number(p.y), Number(p.z)];
                if (p.angle !== "" && p.angle !== undefined) w.linkAngle = parseInt(p.angle, 16) << 16 >> 16;
                w.updateProximity();
                return { link: w.linkPos.join(", ") };
            },
        },
        killWitheredBaba: {
            label: "Kill a Withered Deku Baba",
            help: "z_en_karebaba.c: it is never deleted; it drops to the misc list and offers a stick for 200 frames.",
            params: [{ key: "which", type: "live", label: "Which baba (blank = any)", default: "" }],
            run(w, p) {
                const baba = pick(w, "En_Karebaba", p.which, (a) => !a.dead);
                baba.dead = true;
                w.effect("Effect_Ss_HitMark");
                w.effect("Effect_Ss_Hahen");
                w.effect("Effect_Ss_Dust");
                w.changeCategory(baba, CAT_MISC);
                if (!w.lists[Sim.CAT_ENEMY].length) (w.tempClears = w.tempClears || new Set()).add(w.curRoom);
                return { killed: `${baba.tag} at ${Sim.addr(baba.instance)}` };
            },
        },
        collectItem: {
            label: "Collect a stick or nut you already have",
            help: "z_player.c:7306-7321: the pickup spawns a new item over Link's head that floats for 14 frames.",
            params: [
                { key: "item", type: "choice", label: "Item", choices: () => ["stick", "nut"] },
                { key: "tag", type: "text", label: "Name it", default: "over head" },
            ],
            run(w, p) {
                const params = p.item === "nut" ? 0x800c : 0x800d;
                const drop = w.live("En_Item00").find((a) => !a.killed && (a.params & 0xff) === (params & 0xff) && !(a.params & 0x8000));
                if (drop) w.kill(drop, "collected");
                const item = w.spawn("En_Item00", params, p.tag || "over head", { home: { pos: link(w), rot: [0, 0, 0] } });
                w.updateAll();
                return { overHead: item ? Sim.addr(item.instance) : "did not fit" };
            },
        },
        itemGone: {
            label: "Item over Link's head disappears",
            help: "The floating item is deleted 14 frames after it appeared.",
            params: [{ key: "which", type: "live", label: "Which item (blank = oldest)", default: "" }],
            run(w, p) {
                const items = w.live("En_Item00").filter((a) => (a.params & 0x8000) && !a.killed);
                if (!items.length) throw new Sim.SimError("nothing is over Link's head");
                const item = p.which ? pick(w, "En_Item00", p.which) : items[items.length - 1];
                w.kill(item, "stopped floating");
                w.updateAll();
                return { gone: Sim.addr(item.instance) };
            },
        },
        killDekuBaba: {
            label: "Kill a Deku Baba (nut drop)",
            help: "z_en_dekubaba.c:1003-1026: it shrinks, drops a nut (three for a big one) and is deleted.",
            params: [{ key: "which", type: "live", label: "Which baba (blank = any)", default: "" }],
            run(w, p) {
                const baba = pick(w, "En_Dekubaba", p.which);
                w.effect("Effect_Ss_HitMark");
                w.effect("Effect_Ss_Hahen");
                w.effect("Effect_Ss_Dust");
                const count = baba.params === 1 ? 3 : 1;
                for (let i = 0; i < count; i++) {
                    const nut = w.spawn("En_Item00", 0x000c, `nut drop ${i + 1}`, { home: { pos: baba.home.pos.slice(), rot: [0, 0, 0] } });
                    if (nut) nut.room = -1;
                }
                w.effect("Effect_Ss_KiraKira");
                w.kill(baba, "died");
                w.updateAll();
                return { killed: baba.tag };
            },
        },
        takeOutHookshot: {
            label: "Take out the hookshot",
            help: "z_player.c: Arms_Hook (persistent code) spawns as Link's child when the hookshot comes out; it goes when Link switches item.",
            params: [],
            run(w) {
                const hook = w.spawn("Arms_Hook", 0, "hookshot", { parent: w.player });
                w.updateAll();
                return { hookshot: hook ? Sim.addr(hook.instance) : "did not fit" };
            },
        },
        putAway: {
            label: "Put away the held item",
            help: "The hookshot is killed and freed on the next frame.",
            params: [],
            run(w) {
                for (const hook of w.live("Arms_Hook")) w.kill(hook, "put away");
                w.updateAll();
                return {};
            },
        },
        cutSign: {
            label: "Cut a sign with the sword",
            help: "z_en_kanban.c: each cut spawns a piece (params 0xFFDD) as the sign's child; pieces stay until Link is 500 units away.",
            params: [{ key: "which", type: "live", label: "Which sign (blank = nearest)", default: "" }],
            run(w, p) {
                const signs = w.live("En_Kanban").filter((a) => a.params !== 0xffdd && !a.killed);
                if (!signs.length) throw new Sim.SimError("there is no sign here");
                const dist = (a) => (w.linkPos && a.home ? Math.hypot(a.home.pos[0] - w.linkPos[0], a.home.pos[2] - w.linkPos[2]) : 0);
                const sign = p.which ? pick(w, "En_Kanban", p.which) : signs.sort((a, b) => dist(a) - dist(b))[0];
                const piece = w.spawn("En_Kanban", 0xffdd, `sign piece of ${sign.tag}`, { parent: sign, home: sign.home });
                w.effect("Effect_Ss_Dust");
                w.updateAll();
                return { piece: piece ? Sim.addr(piece.instance) : "did not fit" };
            },
        },
        pullChu: {
            label: "Pull out a bombchu",
            help: "z_player.c:2438: the chu spawns as Link's child at his position, facing his angle.",
            params: [
                { key: "angle", type: "hex", label: "Link's angle", default: "0000" },
                { key: "tag", type: "text", label: "Name it", default: "" },
            ],
            run(w, p) {
                const count = w.live("En_Bom_Chu").length + 1;
                const rot = [0, parseInt(p.angle || "0", 16) << 16 >> 16, 0];
                const chu = w.spawn("En_Bom_Chu", 0, p.tag || `chu ${count}`, { parent: w.player, home: { pos: link(w), rot } });
                // switching from the hookshot kills Arms_Hook in the same Player update, so its block is only freed afterwards
                for (const hook of w.live("Arms_Hook")) w.kill(hook, "switched to a bombchu");
                if (!chu) return { chu: "did not fit" };
                chu.held = true;
                w.updateAll();
                return { chu: `${chu.tag} at ${Sim.addr(chu.instance)}` };
            },
        },
        dropChu: {
            label: "Drop the bombchu",
            help: "z_en_bom_chu.c:228-255 and 360: it becomes targetable and plays its driving sound.",
            params: [],
            run(w) {
                const chu = heldChu(w);
                if (!chu) throw new Sim.SimError("Link is not holding a bombchu");
                chu.held = false;
                chu.flags |= ACTOR_FLAG_ATTENTION_ENABLED | ACTOR_FLAG_SFX_ACTOR_POS_2;
                return { dropped: Sim.addr(chu.instance) };
            },
        },
        chuExplodes: {
            label: "A bombchu explodes",
            help: "z_en_bom_chu.c:119-139 and z_en_bom.c: En_Bom (persistent code) spawns, the chu goes a frame later, the explosion lasts 10 frames.",
            params: [
                { key: "which", type: "live", label: "Which chu (blank = oldest)", default: "" },
                { key: "spark", type: "bool", label: "Fuse spark effect (explodes on an even frame)", default: true },
                { key: "finish", type: "bool", label: "Wait for the explosion to finish", default: true },
            ],
            run(w, p) {
                const chu = pick(w, "En_Bom_Chu", p.which);
                chu.held = false;
                const bomb = w.spawn("En_Bom", 0, `explosion of ${chu.tag}`, { home: { pos: chu.home.pos.slice(), rot: [0, 0, 0] } });
                if (p.spark) w.effect("Effect_Ss_G_Spk");
                w.effect("Effect_Ss_Dust");
                w.effect("Effect_Ss_Bomb2");
                w.effect("Effect_Ss_Blast");
                w.kill(chu, "exploded");
                chu.flags &= ~ACTOR_FLAG_ATTENTION_ENABLED;
                w.updateAll();
                if (bomb && p.finish) {
                    w.kill(bomb, "explosion over");
                    w.updateAll();
                }
                return { exploded: `${chu.tag} at ${Sim.addr(chu.instance)}` };
            },
        },
        releaseBugs: {
            label: "Release bugs from a bottle",
            help: "z_player.c:14161-14179: three bugs appear at Link's hand.",
            params: [],
            run(w) {
                const rot = [0x4000, (w.linkAngle || 0) << 16 >> 16, 0];
                const bug = w.spawn("En_Insect", 2, "bottle bug 1", { home: { pos: link(w), rot } });
                w.updateAll();
                return { bugs: bug ? Sim.addr(bug.instance) : "did not fit" };
            },
        },
        catchBugs: {
            label: "Catch the bottle bugs",
            help: "z_en_insect.c:783-788: caught bugs are deleted.",
            params: [{ key: "count", type: "number", label: "How many", default: 3 }],
            run(w, p) {
                const bugs = w.live("En_Insect").filter((a) => (a.params === 2 || a.params === 3) && !a.killed).slice(0, Number(p.count));
                for (const bug of bugs) w.kill(bug, "caught");
                w.updateAll();
                return { caught: bugs.length };
            },
        },
        talkDekuTree: {
            label: "Deku Tree conversation",
            help: "z_bg_treemouth.c:157-204: each part points the cutscene pointer into the Deku Tree's code.",
            params: [{ key: "part", type: "choice", label: "Part", choices: () => ["meeting", "no", "choice", "yes"] }],
            run(w, p) {
                const names = { meeting: "gDekuTreeMeetingCs", choice: "gDekuTreeChoiceCs", yes: "gDekuTreeMouthOpeningCs", no: "gDekuTreeAskAgainCs" };
                if (p.part === "meeting") w.flags.events.add("EVENTCHKINF_0C");
                if (p.part === "yes") w.flags.events.add("EVENTCHKINF_05");
                w.setActorPointer("Bg_Treemouth", CS_TREEMOUTH[p.part], names[p.part]);
                return { pointer: Sim.addr(w.cs.value) };
            },
        },
        warpSong: {
            label: "Play a warp song",
            help: "z_player.c:13775-13840 and 14331-14337, z_demo_kankyo.c:271-378: Demo_Kankyo 0x0F leaves, Link arrives (respawnFlag -3) and his first update spawns Demo_Kankyo 0x10, whose warp-out cutscene becomes the pointer.",
            params: [
                { key: "song", type: "choice", label: "Song", choices: () => ["minuet", "bolero", "serenade", "requiem", "nocturne", "prelude"] },
                { key: "finish", type: "bool", label: "Let the arrival sparkles finish (Demo_Kankyo 0x10 killed)", default: false },
            ],
            run(w, p) {
                // sWarpSongEntrances (z_player.c:13775), indexed by msgCtx.lastPlayedSong
                const SONGS = {
                    minuet: "ENTR_SACRED_FOREST_MEADOW_2", bolero: "ENTR_DEATH_MOUNTAIN_CRATER_4", serenade: "ENTR_LAKE_HYLIA_8",
                    requiem: "ENTR_DESERT_COLOSSUS_5", nocturne: "ENTR_GRAVEYARD_7", prelude: "ENTR_TEMPLE_OF_TIME_7",
                };
                // Offsets of the eight scripts inside ovl_Demo_Kankyo (text 0x28E0, then data1..data8 in link order; checked in the NTSC 1.2 ROM)
                const CS = {
                    inAdult: [0x28e0, "gAdultWarpInCS"], inAdultToT: [0x2b70, "gAdultWarpInToTCS"], inChild: [0x2da0, "gChildWarpInCS"], inChildToT: [0x3050, "gChildWarpInToTCS"],
                    outAdult: [0x29f0, "gAdultWarpOutCS"], outAdultToT: [0x2c80, "gAdultWarpOutToTCS"], outChild: [0x2ed0, "gChildWarpOutCS"], outChildToT: [0x3180, "gChildWarpOutToTCS"],
                };
                const song = p.song || "minuet";
                const entrance = SONGS[song];
                if (!entrance) throw new Sim.SimError(`unknown warp song ${song}`);
                const here = w.sceneData ? w.sceneData.enum : "";
                // z_parameter.c sRestrictionFlags: ocarina (flags2 & 0x0C) and warp songs (flags2 & 3 == 3, z_message.c:3530)
                const NO_OCARINA = ["CHAMBER_OF_THE_SAGES", "SHOOTING_GALLERY", "CASTLE_COURTYARD_GUARDS_DAY", "CASTLE_COURTYARD_GUARDS_NIGHT", "GANONS_TOWER_COLLAPSE_EXTERIOR",
                    "CASTLE_COURTYARD_ZELDA", "FISHING_POND", "BOMBCHU_BOWLING_ALLEY", "POTION_SHOP_GRANNY", "TREASURE_BOX_SHOP", "DEKU_TREE_BOSS", "DODONGOS_CAVERN_BOSS",
                    "JABU_JABU_BOSS", "FOREST_TEMPLE_BOSS", "SHADOW_TEMPLE_BOSS", "FIRE_TEMPLE_BOSS", "WATER_TEMPLE_BOSS", "SPIRIT_TEMPLE_BOSS", "GANONDORF_BOSS", "GANON_BOSS",
                    "GANONS_TOWER_COLLAPSE_INTERIOR", "INSIDE_GANONS_CASTLE_COLLAPSE"];
                const NO_WARP = ["GERUDO_TRAINING_GROUND", "WINDMILL_AND_DAMPES_GRAVE", "INSIDE_GANONS_CASTLE"];
                if (NO_OCARINA.includes(here.replace(/^SCENE_/, ""))) throw new Sim.SimError("the ocarina can't be used here");
                if (NO_WARP.includes(here.replace(/^SCENE_/, ""))) throw new Sim.SimError("warp songs are disabled here");
                const age = w.flags.adult ? "Adult" : "Child";
                const report = { song };
                // z_player.c:13834 Link's action spawns WARP_OUT (Actor_Spawn at 0,0,0); on warpTimer 1 it points the cutscene at the warp-in script
                const leave = w.spawn("Demo_Kankyo", 0x0f, "warp sparkles (leaving)", { home: { pos: [0, 0, 0], rot: [0, 0, 0] } });
                if (leave) {
                    w.updateAll();
                    const [offset, name] = CS[`in${age}${here === "SCENE_TEMPLE_OF_TIME" ? "ToT" : ""}`];
                    w.setActorPointer("Demo_Kankyo", offset, `${name}, leaving`);
                    report.leaving = Sim.addr(leave.instance);
                } else {
                    report.leaving = "did not fit: Environment_WarpSongLeave runs at once";
                }
                // z_demo.c:2439 respawnFlag -3 still lets the story triggers run; Player_Init (z_player.c:10796) then starts idle, without the sparkles
                const lightArrows = song === "prelude" && w.flags.adult && w.hasQuest("QUEST_MEDALLION_SPIRIT") && w.hasQuest("QUEST_MEDALLION_SHADOW") && !w.event("EVENTCHKINF_C4");
                let arrival = null;
                const arrive = (world) => {
                    arrival = world.spawn("Demo_Kankyo", 0x10, "warp sparkles", { parent: world.player, home: { pos: [0, 0, 0], rot: [0, 0, 0] } });
                    const [offset, name] = CS[`out${age}${world.sceneData.enum === "SCENE_TEMPLE_OF_TIME" ? "ToT" : ""}`];
                    world.setActorPointer("Demo_Kankyo", offset, name);
                };
                Object.assign(report, N64Route.enterEntrance(w, entrance, lightArrows ? {} : { playerFirstUpdate: arrive }));
                report.sparkles = arrival ? Sim.addr(arrival.instance) : lightArrows ? "none: the light arrow cutscene plays instead" : "did not fit";
                // z_demo_kankyo.c:852-855 the sparkles kill themselves once the warp-out cutscene is idle; the pointer stays
                if (arrival && p.finish) {
                    w.kill(arrival, "warp-out sparkles done");
                    w.updateAll();
                }
                return report;
            },
        },
        voidOut: {
            label: "Void out / fall into a pit",
            help: "z_player.c:5196-5230, 5280-5292, 14381-14392 and z_play.c:1927-1962: a void plane reloads at the respawn point (respawnFlag 1), a pit or quicksand reloads the entrance (respawnFlag -1).",
            params: [
                { key: "kind", type: "choice", label: "What happened", choices: () => ["void plane (void out)", "pit or quicksand (back to the entrance)"] },
                { key: "room", type: "number", label: "Respawn room (-1 = the entrance's room)", default: -1 },
                { key: "at", type: "text", label: "Respawn position x, y, z (blank = the entrance's spawn point)", default: "" },
            ],
            run(w, p) {
                const base = N64Route.STEPS.voidOut.baseEntrance(w);
                const temp = [...(w.tempSwitches || [])];
                const inGrotto = ["SCENE_GROTTOS", "SCENE_FAIRYS_FOUNTAIN"].includes(w.sceneData.enum);
                if (String(p.kind || "").startsWith("pit")) {
                    // Play_TriggerRespawn: respawn DOWN is reset to here (not in grottos), then the last entrance loads at its spawn with respawnFlag -1
                    const entrance = w.sceneData.enum === "SCENE_ICE_CAVERN" ? "ENTR_ICE_CAVERN_0" : base;
                    const report = N64Route.STEPS.voidOut.respawnLoad(w, entrance, { flag: -1, temp: inGrotto ? [] : temp });
                    report.respawnFlag = -1;
                    return report;
                }
                // Play_TriggerVoidOut: respawn DOWN (the entrance or the last door, never set inside grottos) with this scene's temp flags
                let entrance = base;
                const down = w.state.down && w.state.down.arena === w.arena ? w.state.down : null;
                if (inGrotto && w.state.grottoReturn) entrance = w.state.grottoReturn.entrance;
                const at = String(p.at || "").trim();
                const pos = at ? at.split(/[\s,]+/).map(Number) : down && !inGrotto ? down.pos : null;
                const room = Number(p.room) >= 0 ? Number(p.room) : down && !inGrotto ? down.room : undefined;
                const report = N64Route.STEPS.voidOut.respawnLoad(w, entrance, { flag: 1, temp, pos, angle: w.linkAngle, room });
                report.respawnFlag = 1;
                w.state.down = { arena: w.arena, room: w.curRoom, pos: w.linkPos ? w.linkPos.slice() : null };
                return report;
            },
            // The base entrance (save.entranceIndex) behind the loaded, layer-adjusted one
            baseEntrance(w) {
                return w.entranceBase || w.entranceName || "";
            },
            // Play_Init with a respawn: the flag, respawn room and position, and the temp switch flags Player_Init restores
            respawnLoad(w, entrance, o = {}) {
                return N64Route.enterEntrance(w, entrance, { ...(o.options || {}), respawnFlag: o.flag, temp: o.temp, pos: o.pos, angle: o.angle, room: o.room });
            },
        },
        faroresWind: {
            label: "Cast Farore's Wind",
            help: "z_player.c:6040-6048, 14735-14868 and z_magic_wind.c: setting spawns Magic_Wind (~170 frames); warping loads the point with respawnFlag 3 and spawns nothing.",
            params: [
                { key: "action", type: "choice", label: "Action", choices: () => ["set a warp point", "warp to the point", "dispel the point"] },
                { key: "finish", type: "bool", label: "Let the wind effect finish (set only)", default: true },
            ],
            run(w, p) {
                const here = w.sceneData.enum.replace(/^SCENE_/, "");
                // z_parameter.c:1162 restrictions.farores: only scenes with flags3 & 0x30 == 0 allow it
                const ALLOWED = ["DEKU_TREE", "DODONGOS_CAVERN", "JABU_JABU", "FOREST_TEMPLE", "FIRE_TEMPLE", "WATER_TEMPLE", "SPIRIT_TEMPLE", "SHADOW_TEMPLE",
                    "BOTTOM_OF_THE_WELL", "ICE_CAVERN", "GANONS_TOWER", "GROTTOS", "CUTSCENE_MAP", "BESITU", "DEPTH_TEST", "HAIRAL_NIWA2", "SASATEST", "SUTARU", "SYOTES",
                    "SYOTES2", "TEST01", "TESTROOM"];
                if (!ALLOWED.includes(here)) throw new Sim.SimError("Farore's Wind can't be used here");
                const action = String(p.action || "set");
                const point = w.state.faroresWind;
                if (action.startsWith("set")) {
                    if (point) throw new Sim.SimError("a warp point is already set: casting asks to warp or dispel");
                    // z_player.c:14817 Player_SpawnMagicSpell: Magic_Wind (absolute code space) at Link; its Init rule allocates its SkelCurve table
                    const wind = w.spawn("Magic_Wind", 0, "Farore's Wind", { home: { pos: link(w), rot: [0, 0, 0] } });
                    if (wind) wind.room = -1;
                    w.updateAll();
                    // z_player.c:14841 Play_SetupRespawnPoint(RESPAWN_MODE_TOP) is skipped in grottos and fairy fountains: the old point stays
                    const stale = ["GROTTOS", "FAIRYS_FOUNTAIN"].includes(here);
                    if (stale) {
                        if (!w.state.faroresWindStale) throw new Sim.SimError("in a grotto the warp point keeps an older respawn point, which this route never set");
                        w.state.faroresWind = w.state.faroresWindStale;
                    } else {
                        w.state.faroresWind = { entrance: N64Route.STEPS.voidOut.baseEntrance(w), room: w.curRoom, pos: link(w), angle: w.linkAngle || 0, temp: [...(w.tempSwitches || [])] };
                    }
                    // z_actor.c:2172-2245 the warp point sparkles use Effect_Ss_KiraKira
                    w.effect("Effect_Ss_KiraKira");
                    if (wind && p.finish) {
                        w.kill(wind, "wind faded out");
                        w.updateAll();
                    }
                    return { wind: wind ? Sim.addr(wind.instance) : "did not fit", point: `${w.state.faroresWind.entrance} room ${w.state.faroresWind.room}` };
                }
                if (!point) throw new Sim.SimError("no warp point is set: casting would set one");
                // z_player.c:14755-14763 choice 1 negates respawn[TOP].data; nothing spawns
                if (action.startsWith("dispel")) {
                    w.state.faroresWindStale = point;
                    delete w.state.faroresWind;
                    return { dispelled: point.entrance };
                }
                // z_player.c:14749-14754 choice 0: respawnFlag 3 loads respawn[TOP]; Player_StartMode_FaroresWind spawns nothing
                w.state.faroresWindStale = point;
                delete w.state.faroresWind;
                const report = N64Route.STEPS.voidOut.respawnLoad(w, point.entrance, { flag: 3, temp: point.temp, pos: point.pos, angle: point.angle, room: point.room });
                report.respawnFlag = 3;
                // z_player.c:10784 Player_Init sets respawn DOWN to the arrival point
                w.state.down = { arena: w.arena, room: point.room, pos: point.pos.slice() };
                return report;
            },
        },
        enterGrotto: {
            label: "Drop into a grotto",
            help: "z_door_ana.c:140-153: the hole saves respawn RETURN (entrance, room, Link's x/z at the hole's height, temp flags, data = params) and loads ENTR_GROTTOS_n or the fairy fountain normally.",
            params: [{ key: "which", type: "live", label: "Which grotto hole (blank = nearest)", default: "" }],
            run(w, p) {
                const GROTTOS = ["ENTR_FAIRYS_FOUNTAIN_0", "ENTR_GROTTOS_0", "ENTR_GROTTOS_1", "ENTR_GROTTOS_2", "ENTR_GROTTOS_3", "ENTR_GROTTOS_4", "ENTR_GROTTOS_5",
                    "ENTR_GROTTOS_6", "ENTR_GROTTOS_7", "ENTR_GROTTOS_8", "ENTR_GROTTOS_9", "ENTR_GROTTOS_10", "ENTR_GROTTOS_11", "ENTR_GROTTOS_12", "ENTR_GROTTOS_13"];
                const holes = w.live("Door_Ana").filter((a) => !a.killed);
                if (!holes.length) throw new Sim.SimError("there is no grotto hole here");
                const dist = (a) => (w.linkPos && a.home ? Math.hypot(a.home.pos[0] - w.linkPos[0], a.home.pos[2] - w.linkPos[2]) : 0);
                const hole = p.which ? holes.find((a) => a.tag === p.which || Sim.addr(a.instance) === String(p.which).toUpperCase()) : holes.sort((a, b) => dist(a) - dist(b))[0];
                if (!hole) throw new Sim.SimError(`no grotto hole matches ${p.which}`);
                // a hidden hole had to be opened first, which clears params 0x0300 (z_door_ana.c:127)
                const params = hole.params & ~0x0300 & 0xffff;
                let index = ((params >> 12) & 7) - 1;
                if (index < 0) index = ((hole.home.rot[2] << 16) >> 16) + 1;
                const entrance = GROTTOS[index];
                if (!entrance) throw new Sim.SimError(`grotto destination ${index} is out of range`);
                const pos = [link(w)[0], hole.home.pos[1], link(w)[2]];
                w.state.grottoReturn = { entrance: N64Route.STEPS.voidOut.baseEntrance(w), room: w.curRoom, pos, angle: (hole.home.rot[1] << 16) >> 16, temp: [...(w.tempSwitches || [])], data: params };
                // respawn[RETURN].data: grotto chests (En_Torch) and the grotto's contents read it
                w.flags.grottoReturnData = params;
                const report = N64Route.enterEntrance(w, entrance);
                report.returnData = Sim.hex(params, 4);
                return report;
            },
        },
        leaveGrotto: {
            label: "Climb out of a grotto",
            help: "z_player.c:5209-5214 and 10606-10612: ENTR_RETURN_GROTTO loads respawn RETURN with respawnFlag 2 (saved room, position, temp flags); Link jumps out, nothing spawns.",
            params: [],
            run(w) {
                const ret = w.state.grottoReturn;
                if (!ret) throw new Sim.SimError("this route never entered a grotto");
                const report = N64Route.STEPS.voidOut.respawnLoad(w, ret.entrance, { flag: 2, temp: ret.temp, pos: ret.pos, angle: ret.angle, room: ret.room });
                report.respawnFlag = 2;
                return report;
            },
        },
        gameOverContinue: {
            label: "Die and continue",
            help: "z_kaleido_scope.c:4572-4650 and z_play.c:1936-1962: Continue reloads the last entrance (boss rooms give the dungeon entrance) with respawnFlag -2 and the temp flags; for a pending cutscene index use Wrong warp.",
            params: [],
            run(w) {
                const entrance = gameOverEntrance(N64Route.STEPS.voidOut.baseEntrance(w), w.sceneData.enum);
                // Play_TriggerRespawn stores this scene's temp flags in respawn DOWN (skipped in grottos and fairy fountains)
                const inGrotto = ["SCENE_GROTTOS", "SCENE_FAIRYS_FOUNTAIN"].includes(w.sceneData.enum);
                w.objectSpace.gameOverOpened(w.flags.japanese);
                const report = N64Route.STEPS.voidOut.respawnLoad(w, entrance, { flag: -2, temp: inGrotto ? [] : [...(w.tempSwitches || [])] });
                report.respawnFlag = -2;
                return report;
            },
        },
        sunsSong: {
            label: "Play the Sun's Song / let time pass",
            help: "z_parameter.c:4355-4417: Oceff_Spot, then time speeds up where it flows (no reload) or the entrance reloads at 00:00 / 12:00 (respawnFlag -2); dungeon rooms and graves do nothing.",
            params: [{ key: "how", type: "choice", label: "How", choices: () => ["Sun's Song", "wait for time to pass"] }],
            run(w, p) {
                const here = w.sceneData.enum;
                // scenes whose room time settings move (timeSpeed != 0) on layers 0-3
                const FLOWS = ["spot00", "spot03", "spot06", "spot09", "spot11", "spot15", "spot16", "turibori"];
                const flows = FLOWS.includes(w.sceneName) && w.layer < 4;
                const song = !String(p.how || "").startsWith("wait");
                if (!song && !flows) throw new Sim.SimError("time doesn't pass in this area");
                const report = {};
                if (song) {
                    const NO_OCARINA = ["CHAMBER_OF_THE_SAGES", "SHOOTING_GALLERY", "CASTLE_COURTYARD_GUARDS_DAY", "CASTLE_COURTYARD_GUARDS_NIGHT", "GANONS_TOWER_COLLAPSE_EXTERIOR",
                        "CASTLE_COURTYARD_ZELDA", "FISHING_POND", "BOMBCHU_BOWLING_ALLEY", "POTION_SHOP_GRANNY", "TREASURE_BOX_SHOP", "DEKU_TREE_BOSS", "DODONGOS_CAVERN_BOSS",
                        "JABU_JABU_BOSS", "FOREST_TEMPLE_BOSS", "SHADOW_TEMPLE_BOSS", "FIRE_TEMPLE_BOSS", "WATER_TEMPLE_BOSS", "SPIRIT_TEMPLE_BOSS", "GANONDORF_BOSS", "GANON_BOSS",
                        "GANONS_TOWER_COLLAPSE_INTERIOR", "INSIDE_GANONS_CASTLE_COLLAPSE"];
                    if (NO_OCARINA.includes(here.replace(/^SCENE_/, ""))) throw new Sim.SimError("the ocarina can't be used here");
                    // z_message.c:3451-3456 sOcarinaEffectActorIds[SUNS - SARIAS] = Oceff_Spot (absolute code space); it starts the song's effect when it ends
                    const spot = w.spawnAndRemove("Oceff_Spot", 0, "Sun's Song effect ends", { home: { pos: link(w), rot: [0, 0, 0] } });
                    report.effect = spot ? Sim.addr(spot.instance) : "did not fit";
                }
                const wasNight = !!w.flags.night;
                if (flows) {
                    // time runs to 18:00 or 06:30; the layer stays until the next load, actors react to IS_DAY themselves
                    w.flags.night = !wasNight;
                    w.dayTime = wasNight ? 0x4555 : 0xc001;
                    return Object.assign(report, { reload: false, night: w.flags.night });
                }
                // ROOM_TYPE_DUNGEON rooms (all rooms of these scenes except Dampe's grave room 6 and Twinrova's room 3) and restrictions.sunsSong == 3 set SUNSSONG_SPECIAL
                const DUNGEON = ["Bmori1", "HAKAdan", "HAKAdanCH", "HIDAN", "MIZUsin", "bdan", "ddan", "ganon", "ganon_boss", "ganon_sonogo", "ganontika", "ganontikasonogo",
                    "gerudoway", "hakasitarelay", "ice_doukutu", "jyasinboss", "jyasinzou", "men", "ydan"];
                const dungeonRoom = DUNGEON.includes(w.sceneName) && !(w.sceneName === "hakasitarelay" && w.curRoom === 6) && !(w.sceneName === "jyasinboss" && w.curRoom === 3);
                const GRAVES = ["SCENE_REDEAD_GRAVE", "SCENE_GRAVE_WITH_FAIRYS_FOUNTAIN", "SCENE_ROYAL_FAMILYS_TOMB", "SCENE_FAIRYS_FOUNTAIN", "SCENE_MARKET_ENTRANCE_RUINS",
                    "SCENE_MARKET_RUINS", "SCENE_TEMPLE_OF_TIME_EXTERIOR_RUINS", "SCENE_ICE_CAVERN"];
                if (dungeonRoom || GRAVES.includes(here)) return Object.assign(report, { reload: false, note: "SUNSSONG_SPECIAL: only Redeads react" });
                // nextDayTime NEXT_TIME_NIGHT (00:00) or NEXT_TIME_DAY (12:00), then the same entrance reloads with the other day/night layer
                w.flags.night = !wasNight;
                w.dayTime = wasNight ? 0x8001 : 0x0000;
                const base = N64Route.STEPS.voidOut.baseEntrance(w);
                Object.assign(report, N64Route.enterEntrance(w, base), { reload: true, respawnFlag: -2, night: w.flags.night });
                return report;
            },
        },
        eponasSong: {
            label: "Play Epona's Song",
            help: "z_message.c:3451-3456 and 3542, z_en_horse.c:1756-1782: Oceff_Wipe2 plays; the inactive Epona that Actor_InitPlayerHorse spawned at load (adult, field scenes) runs to Link, nothing new spawns.",
            params: [],
            run(w) {
                const spot = w.spawnAndRemove("Oceff_Wipe2", 0, "Epona's Song effect ends", { home: { pos: link(w), rot: [0, 0, 0] } });
                const report = { effect: spot ? Sim.addr(spot.instance) : "did not fit" };
                // z_horse.c:19-31 Horse_CanSpawn and z_horse.c:295-322: only adult Link in these scenes gets Epona at load
                const HORSE_SCENES = ["SCENE_HYRULE_FIELD", "SCENE_LAKE_HYLIA", "SCENE_GERUDO_VALLEY", "SCENE_GERUDOS_FORTRESS", "SCENE_LON_LON_RANCH"];
                const epona = w.live("En_Horse").find((a) => !a.killed && !(a.params & 0x8000));
                if (!w.flags.adult || !w.event("EVENTCHKINF_EPONA_OBTAINED") || !HORSE_SCENES.includes(w.sceneData.enum)) {
                    report.epona = "does not come (child, Epona not obtained, or not a horse scene)";
                } else if (epona) {
                    report.epona = `runs to Link: ${Sim.addr(epona.instance)}`;
                } else {
                    report.epona = "should have been spawned at load by Actor_InitPlayerHorse, which the simulator does not model";
                }
                return report;
            },
        },
        // Timed deaths: w.afterUpdates(actor, n, kill) with n = the game's Actor_Kill Update + 1, so the block frees on the game's pass
        spinAttackMagic: {
            label: "Spin attack with magic",
            help: "z_player.c:4360-4374 and z_en_m_thunder.c: En_M_Thunder (room -1) stays for the spin, 16 frames after release; a charged spin adds an Eff_Dust child after 8 frames of charge, which lingers 10 frames after release.",
            params: [
                { key: "kind", type: "choice", label: "Spin", choices: () => ["quick spin", "charged spin"], default: "quick spin" },
                { key: "sword", type: "choice", label: "Sword", choices: () => ["Kokiri Sword", "Master Sword", "Biggoron's Sword"], default: "Kokiri Sword" },
                { key: "charge", type: "number", label: "Charged spin: frames B is held (8+ to spin, 9+ for the dust)", default: 45 },
                { key: "finish", type: "bool", label: "Let the spin finish", default: true },
            ],
            run(w, p) {
                // Player_GetMeleeWeaponHeld: 1 Master, 2 Kokiri, 3 Biggoron; Eff_Dust type = weapon + 1 (z_en_m_thunder.c swordType + 2)
                const weapon = { "Master Sword": 1, "Kokiri Sword": 2, "Biggoron's Sword": 3 }[p.sword] || 2;
                const charged = p.kind === "charged spin";
                const home = { pos: link(w), rot: [0, ((w.linkAngle || 0) + 0x8000) << 16 >> 16, 0] };
                const thunder = w.spawn("En_M_Thunder", weapon | (charged ? 0x200 : 0), charged ? "charged spin" : "quick spin", { home });
                if (!thunder) return { spin: "did not fit" };
                thunder.room = -1; // z_en_m_thunder.c Init
                const report = { spin: Sim.addr(thunder.instance) };
                let dust = null;
                if (!charged) {
                    // Init with PLAYER_STATE2_17: EnMThunder_SpinAttacking, spinAttackTimer 1.0 - 1/16 per Update, killed on the 16th
                    w.afterUpdates(thunder, 17, () => w.kill(thunder, "spin over"));
                } else {
                    const hold = Math.max(1, Number(p.charge) || 1);
                    if (hold < 8) {
                        // released with unk_858 <= 0.15: no spin, killed on the release Update
                        w.afterUpdates(thunder, hold + 2, () => w.kill(thunder, "released too early"));
                    } else if (hold === 8) {
                        w.afterUpdates(thunder, hold + 17, () => w.kill(thunder, "spin over"));
                    } else {
                        // unk_858 steps 0.02 per frame; above 0.15 (8th Update after the charge starts) Eff_Dust spawns as its child
                        w.afterUpdates(thunder, 9, () => {
                            dust = w.spawn("Eff_Dust", weapon + 1, "spin charge dust", { parent: thunder, home: { pos: link(w), rot: home.rot.slice() } });
                            if (dust) {
                                report.dust = Sim.addr(dust.instance);
                                // release sets its parent NULL; life 10 counts down, then Actor_Kill
                                w.afterUpdates(dust, hold + 4, () => w.kill(dust, "spin charge released"));
                            }
                            w.afterUpdates(thunder, hold + 9, () => w.kill(thunder, "spin over"));
                        });
                    }
                }
                w.updateAll();
                if (p.finish) {
                    for (let i = 0; i < 400 && (w.allActors().includes(thunder) || (dust && w.allActors().includes(dust))); i++) w.updateAll();
                }
                return report;
            },
        },
        castSpell: {
            label: "Cast a magic spell",
            help: "z_player.c:10624-10629 and 14817: Din's Fire = Magic_Fire (92 frames), Nayru's Love = Magic_Dark (1257 frames), Farore's Wind = Magic_Wind (152 frames, plus a 0x36 SkelCurve joint table); absolute code space, room -1.",
            params: [
                { key: "spell", type: "choice", label: "Spell", choices: () => ["Din's Fire", "Nayru's Love", "Farore's Wind"], default: "Din's Fire" },
                { key: "finish", type: "bool", label: "Let it finish", default: true },
            ],
            run(w, p) {
                // Fire: 21 BeforeCast + 71 Update; Dark: 56 orb + 1201 diamond; Wind: 30 wait + 40 grow (SkelCurve 1.5/Update) + 51 hold + 31 fade
                const spells = {
                    "Din's Fire": { name: "Magic_Fire", life: 92 },
                    "Nayru's Love": { name: "Magic_Dark", life: 1257 },
                    "Farore's Wind": { name: "Magic_Wind", life: 152 },
                };
                const spell = spells[p.spell] || spells["Din's Fire"];
                const actor = w.spawn(spell.name, 0, p.spell, { home: { pos: link(w), rot: [0, 0, 0] } });
                if (!actor) return { spell: "did not fit" };
                actor.room = -1;
                w.afterUpdates(actor, spell.life + 1, () => w.kill(actor, `${p.spell} over`));
                w.updateAll();
                if (p.finish) for (let i = 0; i < 1300 && w.allActors().includes(actor); i++) w.updateAll();
                return { spell: Sim.addr(actor.instance) };
            },
        },
        shootArrow: {
            label: "Draw and shoot an arrow or seed",
            help: "z_player.c:2790-2825 and z_en_arrow.c: drawing spawns En_Arrow (0x1E joint + morph tables for arrows) as Link's child, and a magic arrow's first Update adds Arrow_Fire/Ice/Light; flight, sticking and fade times follow the decomp.",
            params: [
                { key: "ammo", type: "choice", label: "Ammo (ignored if one is already drawn)", choices: () => ["arrow", "fire arrow", "ice arrow", "light arrow", "slingshot seed"], default: "arrow" },
                { key: "outcome", type: "choice", label: "What happens", choices: () => ["hits a wall", "hits an actor", "misses", "draw only (keep it drawn)", "put away while drawn"], default: "hits a wall" },
                { key: "hold", type: "number", label: "Frames held drawn before release", default: 10 },
                { key: "flight", type: "number", label: "Frames of flight before it hits", default: 3 },
                { key: "lit", type: "bool", label: "Normal arrow passes a lit torch (becomes lit)", default: false },
                { key: "finish", type: "bool", label: "Wait until it (and its magic effect) is gone", default: true },
            ],
            run(w, p) {
                const types = { arrow: 2, "fire arrow": 3, "ice arrow": 4, "light arrow": 5, "slingshot seed": 9 };
                const magicNames = { 3: "Arrow_Fire", 4: "Arrow_Ice", 5: "Arrow_Light" };
                const report = {};
                let arrow = w.live("En_Arrow").find((a) => a.nocked && !a.killed);
                if (!arrow) {
                    const type = types[p.ammo] === undefined ? 2 : types[p.ammo];
                    for (const hook of w.live("Arms_Hook")) w.kill(hook, "switched to the bow");
                    arrow = w.spawn("En_Arrow", type, p.ammo, { parent: w.player, home: { pos: link(w), rot: [0, (w.linkAngle || 0) << 16 >> 16, 0] } });
                    if (!arrow) return { arrow: "did not fit" };
                    arrow.nocked = true;
                    if (magicNames[type]) {
                        // z_en_arrow.c:416-423 first Update: Actor_SpawnAsChild the elemental actor
                        w.afterUpdates(arrow, 1, () => {
                            arrow.magic = w.spawn(magicNames[type], 0, `${p.ammo} effect`, { parent: arrow, home: { pos: link(w), rot: [0, 0, 0] } });
                        });
                    }
                    w.updateAll();
                    if (p.outcome !== "draw only (keep it drawn)") for (let i = 1; i < Math.max(1, Number(p.hold) || 1); i++) w.updateAll();
                }
                report.arrow = Sim.addr(arrow.instance);
                const magic = arrow.magic && w.allActors().includes(arrow.magic) ? arrow.magic : null;
                if (magic) report.magic = Sim.addr(magic.instance);
                if (p.outcome === "draw only (keep it drawn)") return report;
                const isSeed = arrow.params === 9;
                arrow.nocked = false;
                if (p.outcome === "put away while drawn") {
                    // Player_DetachHeldActor: parent NULL with unk_A73 == 0, so EnArrow_Shoot kills it; the charging effect sees it gone a frame later
                    w.afterUpdates(arrow, 2, () => w.kill(arrow, "put away"));
                    if (magic) w.afterUpdates(magic, 3, () => w.kill(magic, "arrow put away"));
                } else {
                    // release pass: EnArrow_Shoot -> EnArrow_Fly (timer 12, seeds 15); Fly Update j moves into the hit, Update j+1 handles it
                    const j = Math.min(Math.max(1, Number(p.flight) || 1), isSeed ? 13 : 10);
                    if (p.lit && arrow.params === 2) {
                        arrow.params = 0; // z_obj_syokudai.c:206 ARROW_NORMAL_LIT: Effect_Ss_Dust every Update, no longer hits actors
                        w.effect("Effect_Ss_Dust");
                    }
                    const hits = p.outcome === "hits a wall" || (p.outcome === "hits an actor" && arrow.params !== 0);
                    if (!hits) {
                        w.afterUpdates(arrow, isSeed ? 17 : 14, () => w.kill(arrow, "flight timer ran out"));
                    } else if (isSeed) {
                        // z_en_arrow.c:246-266 seed: Effect_Ss_Stone1 and Actor_Kill on impact
                        w.afterUpdates(arrow, j + 2, () => {
                            w.effect("Effect_Ss_Stone1");
                            w.afterUpdates(arrow, 1, () => w.kill(arrow, "seed hit"));
                        });
                    } else {
                        // z_en_arrow.c:268 HitMark; wall: stuck 60 Updates (params >= ARROW_NORMAL_LIT); actor: bounces off and falls 50 Updates
                        const wall = p.outcome === "hits a wall";
                        w.afterUpdates(arrow, j + 2, () => {
                            w.effect("Effect_Ss_HitMark");
                            w.afterUpdates(arrow, wall ? 61 : 51, () => w.kill(arrow, wall ? "stuck arrow gone" : "bounced arrow gone"));
                        });
                    }
                    if (magic) {
                        // z_arrow_fire.c ArrowFire_Fly: sees hitFlags a pass later and bursts 32 Updates, else fades out on its 10th Fly Update
                        const burst = hits && j <= 8;
                        w.afterUpdates(magic, burst ? j + 36 : 12, () => w.kill(magic, burst ? "burst over" : "faded"));
                    }
                }
                w.updateAll();
                if (p.finish) {
                    for (let i = 0; i < 200 && (w.allActors().includes(arrow) || (magic && w.allActors().includes(magic))); i++) w.updateAll();
                }
                return report;
            },
        },
        throwBoomerang: {
            label: "Throw the boomerang",
            help: "z_player.c:3364-3392 and z_en_boom.c: En_Boom (persistent code, room -1) flies out for 20 frames and is killed when it comes back within 40 units of Link.",
            params: [
                { key: "frames", type: "number", label: "Frames until Link catches it (about 20 out and 20 back; less if it bounces off a wall)", default: 40 },
                { key: "finish", type: "bool", label: "Wait until it is caught", default: true },
            ],
            run(w, p) {
                const angle = (w.linkAngle || 0) << 16 >> 16;
                const rad = (angle / 0x8000) * Math.PI;
                const pos = link(w);
                pos[0] += Math.sin(rad) * 10; pos[1] += 30; pos[2] += Math.cos(rad) * 10;
                const boom = w.spawn("En_Boom", 0, "boomerang", { home: { pos, rot: [0, angle, 0] } });
                if (!boom) return { boomerang: "did not fit" };
                boom.room = -1; // z_en_boom.c Init
                w.afterUpdates(boom, Math.max(2, Number(p.frames) || 40) + 1, () => w.kill(boom, "caught"));
                w.updateAll();
                if (p.finish) for (let i = 0; i < 400 && w.allActors().includes(boom); i++) w.updateAll();
                return { boomerang: Sim.addr(boom.instance) };
            },
        },
        throwNut: {
            label: "Throw a Deku Nut",
            help: "z_player.c:13843-13852 and z_en_arrow.c:246-266: the nut is En_Arrow ARROW_NUT; on impact it spawns En_M_Fire1 (the flash, gone after 5 Updates) and Effect_Ss_Stone1; a nut that hits nothing in 15 frames just vanishes.",
            params: [
                { key: "flight", type: "number", label: "Frames of flight before it lands (1-13)", default: 2 },
                { key: "hits", type: "bool", label: "It lands (no flash if it flies off for 15 frames)", default: true },
                { key: "finish", type: "bool", label: "Wait until the flash is gone", default: true },
            ],
            run(w, p) {
                const nut = w.spawn("En_Arrow", 10, "Deku nut", { home: { pos: link(w), rot: [4000, (w.linkAngle || 0) << 16 >> 16, 0] } });
                if (!nut) return { nut: "did not fit" };
                const report = { nut: Sim.addr(nut.instance) };
                let flash = null;
                if (!p.hits) {
                    w.afterUpdates(nut, 17, () => w.kill(nut, "flew off"));
                } else {
                    const j = Math.min(Math.max(1, Number(p.flight) || 1), 13);
                    w.afterUpdates(nut, j + 2, () => {
                        flash = w.spawn("En_M_Fire1", 0, "Deku nut flash", { home: { pos: link(w), rot: [0, 0, 0] } });
                        w.effect("Effect_Ss_Stone1");
                        if (flash) {
                            report.flash = Sim.addr(flash.instance);
                            // z_en_m_fire1.c: timer steps 0.2 to 1.0, Actor_Kill on the 5th Update (this pass is its 1st)
                            w.afterUpdates(flash, 6, () => w.kill(flash, "flash over"));
                        }
                        w.afterUpdates(nut, 1, () => w.kill(nut, "burst"));
                    });
                }
                w.updateAll();
                if (p.finish) {
                    for (let i = 0; i < 100 && (w.allActors().includes(nut) || (flash && w.allActors().includes(flash))); i++) w.updateAll();
                }
                return report;
            },
        },
        useDekuStick: {
            label: "Light or break a Deku stick",
            help: "z_player.c:11452-11474 and 8997-9004: no actor; a burning stick spawns Effect_Ss_Dust every frame for 210 frames, then is put away; a stick breaking spawns Effect_Ss_Stick.",
            params: [
                { key: "what", type: "choice", label: "What happens", choices: () => ["light it on a torch", "break it"], default: "light it on a torch" },
                { key: "burnOut", type: "bool", label: "Let it burn out (210 frames pass)", default: false },
            ],
            run(w, p) {
                if (p.what === "break it") {
                    w.effect("Effect_Ss_Stick");
                    return { stick: "broken" };
                }
                // z_obj_syokudai.c:200-202 sets unk_860 = 210; Player_UpdateBurningDekuStick: func_8002836C (EffectSsDust) each frame
                w.effect("Effect_Ss_Dust");
                if (p.burnOut) for (let i = 0; i < 211; i++) w.updateAll();
                return { stick: p.burnOut ? "burned out" : "burning" };
            },
        },
        swingHammer: {
            label: "Swing the Megaton Hammer",
            help: "z_player.c:14700-14720 and 9095-9100: no actor; a downward swing onto the floor spawns Effect_Ss_Blast (white shockwave); hitting a wall only shakes the camera.",
            params: [{ key: "hits", type: "choice", label: "Hits", choices: () => ["the floor", "a wall", "nothing"], default: "the floor" }],
            run(w, p) {
                if (p.hits === "the floor") w.effect("Effect_Ss_Blast");
                return { hammer: p.hits };
            },
        },
        releaseFromBottle: {
            label: "Release something from a bottle",
            help: "z_player.c:14133-14176: a fish (En_Fish type 0) or blue fire (En_Ice_Hono 0, spreads into 8 + 10 small flames) drops from Link's hand; a fairy (En_Elf 1) circles Link and vanishes; drinking or showing spawns nothing. Bugs: use releaseBugs.",
            params: [
                { key: "what", type: "choice", label: "What", choices: () => ["fish", "blue fire", "fairy", "drink or show (potion, milk, Poe, Big Poe)"], default: "fish" },
                { key: "fall", type: "number", label: "Fish / blue fire: frames falling before it lands", default: 8 },
                { key: "water", type: "bool", label: "Fish lands in water (swims 200 frames instead of flapping 400)", default: false },
                { key: "fairyLife", type: "number", label: "Fairy: frames until it vanishes (about 87-137 by hand height)", default: 110 },
                { key: "finish", type: "bool", label: "Wait until it is all gone", default: true },
            ],
            run(w, p) {
                const angle = (w.linkAngle || 0) << 16 >> 16;
                const fall = Math.max(0, Number(p.fall) || 0);
                const spawned = [];
                const report = {};
                if (p.what === "drink or show (potion, milk, Poe, Big Poe)") {
                    // z_player.c:13985 drinking and 6054-6106 showing a Big Poe: no actor, no allocation
                    return { spawned: "nothing" };
                }
                if (p.what === "fish") {
                    const fish = w.spawn("En_Fish", 0, "bottle fish", { home: { pos: link(w), rot: [0x4000, angle, 0] } });
                    if (!fish) return { fish: "did not fit" };
                    spawned.push(fish);
                    report.fish = Sim.addr(fish.instance);
                    // z_en_fish.c:376-497 lands on Update fall+1; timer 400 on the ground or 200 in water, Actor_Kill when it runs out
                    w.afterUpdates(fish, fall + 1 + (p.water ? 200 : 400) + 1, () => w.kill(fish, "bottle fish timed out"));
                } else if (p.what === "blue fire") {
                    const fire = w.spawn("En_Ice_Hono", 0, "bottle blue fire", { home: { pos: link(w), rot: [0x4000, angle, 0] } });
                    if (!fire) return { blueFire: "did not fit" };
                    spawned.push(fire);
                    report.blueFire = Sim.addr(fire.instance);
                    const flames = (params, count, what) => {
                        for (let i = 0; i < count; i++) {
                            const flame = w.spawn("En_Ice_Hono", params, `${what} ${i + 1}`, { home: { pos: fire.home.pos.slice(), rot: [0, (i * (0x10000 / count)) << 16 >> 16, 0] } });
                            if (!flame) continue;
                            spawned.push(flame);
                            // z_en_ice_hono.c:246 SmallFlameMove timer 44, Actor_Kill on the 44th Update
                            w.afterUpdates(flame, 45, () => w.kill(flame, "small blue flame out"));
                        }
                    };
                    // z_en_ice_hono.c:163-172 on landing 8 params 1 flames; SpreadFlames timer 60, 10 params 2 flames at timer 46, Actor_Kill at 0
                    w.afterUpdates(fire, fall + 1, () => {
                        flames(1, 8, "blue flame");
                        w.afterUpdates(fire, 14, () => {
                            flames(2, 10, "blue flame ring");
                            w.afterUpdates(fire, 47, () => w.kill(fire, "blue fire spread out"));
                        });
                    });
                } else {
                    const rad = (angle / 0x8000) * Math.PI;
                    const pos = link(w);
                    pos[0] += Math.sin(rad) * 5; pos[2] += Math.cos(rad) * 5;
                    const fairy = w.spawn("En_Elf", 1, "bottle fairy", { home: { pos, rot: [0, 0, 0] } });
                    if (!fairy) return { fairy: "did not fit" };
                    spawned.push(fairy);
                    report.fairy = Sim.addr(fairy.instance);
                    w.effect("Effect_Ss_KiraKira"); // EnElf_SpawnSparkles every Update
                    // z_en_elf.c:708-747 func_80A03610: rises then sinks below Link's feet (unk_28C.y < -10), then Actor_Kill
                    w.afterUpdates(fairy, Math.max(1, Number(p.fairyLife) || 110) + 1, () => w.kill(fairy, "revive fairy finished"));
                }
                w.updateAll();
                if (p.finish) for (let i = 0; i < 1000 && spawned.some((a) => w.allActors().includes(a)); i++) w.updateAll();
                return report;
            },
        },
        takeOutItem: {
            label: "Take out an item",
            help: "z_player.c:2426-2466 (sItemActionInitFuncs): only bombs spawn an actor (En_Bom as Link's child, fuse 70 frames, explosion 10 more); the hookshot, bombchus and bow arrows have their own steps; switching item kills a held hookshot or drawn arrow.",
            params: [
                { key: "item", type: "choice", label: "Item", choices: () => ["bomb", "Deku stick", "bow", "slingshot", "boomerang", "Megaton Hammer", "sword", "other (nothing spawns)"], default: "bomb" },
                { key: "tag", type: "text", label: "Name it", default: "" },
            ],
            run(w, p) {
                // switching item: Player_DestroyHookshot kills Arms_Hook; Player_DetachHeldActor lets a drawn arrow's EnArrow_Shoot kill it
                for (const hook of w.live("Arms_Hook")) w.kill(hook, `switched to ${p.item}`);
                for (const arrow of w.live("En_Arrow").filter((a) => a.nocked && !a.killed)) {
                    arrow.nocked = false;
                    w.afterUpdates(arrow, 2, () => w.kill(arrow, "put away"));
                    if (arrow.magic && w.allActors().includes(arrow.magic)) w.afterUpdates(arrow.magic, 3, () => w.kill(arrow.magic, "arrow put away"));
                }
                if (p.item !== "bomb") {
                    w.updateAll();
                    return { item: p.item };
                }
                const count = w.live("En_Bom").length + 1;
                const bomb = w.spawn("En_Bom", 0, p.tag || `bomb ${count}`, { parent: w.player, home: { pos: link(w), rot: [0, (w.linkAngle || 0) << 16 >> 16, 0] } });
                if (!bomb) {
                    w.updateAll();
                    return { bomb: "did not fit" };
                }
                bomb.held = true;
                // z_en_bom.c:239-330 timer 70: fuse spark and dust from timer < 63, Bomb2 + Blast at 0, then EnBom_Explode 10 Updates and Actor_Kill
                w.afterUpdates(bomb, 8, () => {
                    w.effect("Effect_Ss_G_Spk");
                    w.effect("Effect_Ss_Dust");
                    w.afterUpdates(bomb, 62, () => {
                        bomb.held = false;
                        w.effect("Effect_Ss_Bomb2");
                        w.effect("Effect_Ss_Blast");
                        w.afterUpdates(bomb, 11, () => w.kill(bomb, "exploded"));
                    });
                });
                w.updateAll();
                return { bomb: `${bomb.tag} at ${Sim.addr(bomb.instance)}` };
            },
        },
        breakObject: {
            label: "Break a pot, crate, rock or bush",
            help: "z_obj_tsubo.c:252, z_obj_kibako.c:197, z_obj_kibako2.c:155-176, z_en_ishi.c:364, z_obj_bombiwa.c:133, z_obj_hamishi.c:180, z_en_kusa.c:311: hard targets show a hitmark, then fragments, dust and the drop; freed the next frame.",
            params: [
                { key: "which", type: "live", label: "Pot, crate, rock, boulder or bush (blank = nearest)", default: "" },
                { key: "how", type: "choice", label: "Broken by", choices: () => STEPS.breakObject.lib.HOW, default: "sword" },
                { key: "drop", type: "choice", label: "Random drop roll (small rock, bush)", choices: () => STEPS.breakObject.lib.RANDOM, default: "none" },
                { key: "dropCount", type: "number", label: "How many of that drop", default: 1 },
            ],
            // Shared by the world steps: target lookup and the z_en_item00.c drop functions
            lib: {
                TARGETS: ["Obj_Tsubo", "Obj_Kibako", "Obj_Kibako2", "En_Ishi", "Obj_Bombiwa", "Obj_Hamishi", "En_Kusa"],
                HOW: ["sword", "Deku stick", "hammer", "bomb or bombchu", "arrow or slingshot seed", "boomerang", "hookshot", "sinks in deep water"],
                // which weapons break what (each actor's AC check), and which leave a hitmark on its COL_MATERIAL_HARD collider
                BREAKS: {
                    Obj_Tsubo: ["sword", "hammer", "bomb or bombchu", "arrow or slingshot seed", "boomerang", "hookshot", "sinks in deep water"],
                    Obj_Kibako: ["sword", "hammer", "bomb or bombchu", "sinks in deep water"],
                    Obj_Kibako2: ["hammer", "bomb or bombchu"],
                    En_Ishi: ["hammer", "bomb or bombchu"],
                    Obj_Bombiwa: ["hammer", "bomb or bombchu"],
                    Obj_Hamishi: ["hammer"],
                    En_Kusa: ["sword", "hammer", "bomb or bombchu", "boomerang"],
                },
                HARD: ["Obj_Tsubo", "En_Ishi", "Obj_Bombiwa", "Obj_Hamishi"],
                HITMARK: ["sword", "Deku stick", "hammer", "boomerang", "hookshot"],
                RANDOM: ["none", "green rupee", "blue rupee", "red rupee", "purple rupee", "recovery heart", "bombs", "Deku nuts", "Deku stick",
                    "Deku seeds", "arrows (5)", "arrows (10)", "arrows (30)", "magic (small)", "magic (large)", "fairy (Link at 1 heart or less)"],
                RANDOM_IDS: {
                    "green rupee": 0x00, "blue rupee": 0x01, "red rupee": 0x02, "purple rupee": 0x14, "recovery heart": 0x03, bombs: 0x04,
                    "Deku nuts": 0x0c, "Deku stick": 0x0d, "Deku seeds": 0x10, "arrows (5)": 0x08, "arrows (10)": 0x09, "arrows (30)": 0x0a,
                    "magic (small)": 0x0f, "magic (large)": 0x0e, "fairy (Link at 1 heart or less)": "fairy",
                },
                // a live actor by address, tag or name; blank = the nearest to Link; match is a list of names or a test
                find(w, which, match, what) {
                    const test = typeof match === "function" ? match : (a) => match.includes(a.info.name);
                    const list = w.allActors().filter((a) => test(a) && !a.killed);
                    if (!list.length) throw new Sim.SimError(`there is no ${what} here`);
                    if (which !== undefined && which !== "") {
                        const text = String(which);
                        const found = list.find((a) => Sim.addr(a.instance) === text.toUpperCase()) || list.find((a) => a.tag === text) || list.find((a) => a.info.name === text);
                        if (!found) throw new Sim.SimError(`no ${what} matches ${which}`);
                        return found;
                    }
                    const d = (a) => (w.linkPos && a.home ? Math.hypot(a.home.pos[0] - w.linkPos[0], a.home.pos[1] - w.linkPos[1], a.home.pos[2] - w.linkPos[2]) : 0);
                    return list.slice().sort((a, b) => d(a) - d(b))[0];
                },
                // func_8001F404 (z_en_item00.c:611-641): age swaps, no drop for gear Link lacks (magic and full health not modelled)
                convert(w, id) {
                    let d = id;
                    if (w.flags.adult) {
                        if (d === 0x10) d = 0x08;
                        else if (d === 0x0d) d = 0x00;
                    } else if (d === 0x08 || d === 0x09 || d === 0x0a) d = 0x10;
                    if ([0x04, 0x0b, 0x19].includes(d) && !w.hasItem("ITEM_BOMB")) return -1;
                    if ([0x08, 0x09, 0x0a].includes(d) && !w.hasItem("ITEM_BOW")) return -1;
                    if (d === 0x10 && !w.hasItem("ITEM_SLINGSHOT")) return -1;
                    return d;
                },
                // z_en_item00.c:656-659: FAIRY_HEAL_TIMED 40 units up, then the fairy sound effect
                fairy(w, pos, tag) {
                    const elf = w.spawn("En_Elf", 2, tag, { home: { pos: [pos[0], pos[1] + 40, pos[2]], rot: [0, 0, 0] } });
                    w.effect("Effect_Ss_Dead_Sound");
                    return elf;
                },
                // z_en_item00.c:666-682: a thrown-out drop leaves its room (not keys or hearts) and despawns 220 frames after landing
                launched(w, item) {
                    if (![0x06, 0x07, 0x11].includes(item.params & 0xff)) item.room = -1;
                    // falling frames do not count (func_8001E304 adds the frame back); about 18 frames of fall assumed
                    if (![0x06, 0x07, 0x11].includes(item.params & 0xff)) w.afterUpdates(item, 239, () => w.kill(item, "drop despawned"));
                    w.effect("Effect_Ss_KiraKira");
                },
                // Item_DropCollectible (z_en_item00.c:645-686)
                dropCollectible(w, pos, params, tag) {
                    const flag8000 = params & 0x8000, flag4000 = params & 0x4000, flagBits = params & 0x3f00;
                    let id = params & 0xff;
                    if (id === 0x12 && !flag4000) return [STEPS.breakObject.lib.fairy(w, pos, `${tag} fairy`)];
                    if (!flag8000) id = STEPS.breakObject.lib.convert(w, id);
                    if (id < 0) return [];
                    const item = w.spawn("En_Item00", id | flag8000 | flagBits, tag, { home: { pos: pos.slice(), rot: [0, 0, 0] } });
                    if (item && !flag8000 && !item.killed) STEPS.breakObject.lib.launched(w, item);
                    return [item];
                },
                // Item_DropCollectibleRandom (z_en_item00.c:721-842); the drop-table roll is the user's choice, already age-converted
                dropRandom(w, pos, choice, count, tag) {
                    const id = STEPS.breakObject.lib.RANDOM_IDS[choice];
                    if (id === undefined) return [];
                    if (id === "fairy") return [STEPS.breakObject.lib.fairy(w, pos, `${tag} fairy`)];
                    const out = [];
                    for (let i = 0; i < Math.max(1, Number(count) || 1); i++) {
                        const item = w.spawn("En_Item00", id, `${tag} ${i + 1}`, { home: { pos: pos.slice(), rot: [0, 0, 0] } });
                        if (item) STEPS.breakObject.lib.launched(w, item);
                        out.push(item);
                    }
                    return out;
                },
                report(list) {
                    const shown = list.map((a) => (a ? `${a.info.name} ${Sim.hex(a.params, 4)} at ${Sim.addr(a.instance)}${a.killed ? " (killed in Init)" : ""}` : "did not fit"));
                    return shown.length ? shown.join(", ") : "nothing";
                },
                // En_Kusa / En_Ishi: three INSECT_TYPE_SPAWNED bugs, stopping at the first that does not fit (z_en_ishi.c:296, z_en_kusa.c:210)
                bugs(w, a) {
                    const out = [];
                    for (let i = 0; i < 3; i++) {
                        const bug = w.spawn("En_Insect", 1, `bug ${i + 1} from ${a.tag}`, { home: { pos: a.home.pos.slice(), rot: [0, 0, 0] } });
                        out.push(bug);
                        if (!bug) break;
                    }
                    return out;
                },
                // the break itself: effects in the order the actor spawns them, then the drop; returns what dropped
                shatter(w, a, water, p) {
                    const lib = STEPS.breakObject.lib;
                    const pos = a.home.pos.slice();
                    const name = a.info.name;
                    let drops = [];
                    if (name === "Obj_Tsubo" || name === "Obj_Kibako") {
                        if (water) w.effect("Effect_Ss_G_Splash");
                        w.effect("Effect_Ss_Kakera");
                        if (!water) w.effect("Effect_Ss_Dust");
                        const flag = name === "Obj_Tsubo" ? (a.params >> 9) & 0x3f : (a.params >> 8) & 0x3f;
                        if ((a.params & 0x1f) < 0x1a) drops = lib.dropCollectible(w, pos, (a.params & 0x1f) | (flag << 8), `drop from ${a.tag}`);
                    } else if (name === "En_Ishi") {
                        if (!(a.params & 1)) drops = lib.dropRandom(w, pos, p.drop, p.dropCount, `drop from ${a.tag}`);
                        w.effect("Effect_Ss_Kakera");
                        if (!water) w.effect("Effect_Ss_Dust");
                    } else if (name === "En_Kusa") {
                        w.effect("Effect_Ss_Kakera");
                        if ((a.params & 3) === 1) {
                            // ENKUSA_TYPE_1: 50/50 seeds or a heart through Item_DropCollectible
                            drops = lib.dropCollectible(w, pos, p.drop === "recovery heart" ? 0x03 : 0x10, `drop from ${a.tag}`);
                        } else drops = lib.dropRandom(w, pos, p.drop, p.dropCount, `drop from ${a.tag}`);
                    }
                    return drops;
                },
            },
            run(w, p) {
                const lib = STEPS.breakObject.lib;
                const a = lib.find(w, p.which, (x) => lib.TARGETS.includes(x.info.name) && !x.cut && !x.carried, "pot, crate, rock or bush");
                const name = a.info.name;
                if (a.cut) throw new Sim.SimError(`${a.tag} is already cut`);
                if (name === "En_Ishi" && (a.params & 1)) throw new Sim.SimError("a silver boulder only breaks when thrown (use Throw what Link carries)");
                if (!lib.BREAKS[name].includes(p.how)) {
                    const mark = lib.HARD.includes(name) && lib.HITMARK.includes(p.how) ? " (the hit only loads Effect_Ss_HitMark: use the Sword hits something solid action)" : "";
                    throw new Sim.SimError(`${name} does not break from a ${p.how}${mark}`);
                }
                const report = { broke: `${a.tag} at ${Sim.addr(a.instance)}` };
                // z_collision_check.c:1743-1748 and 1563: a hard AC collider draws its hitmark during the hit frame's collision check
                if (lib.HARD.includes(name) && lib.HITMARK.includes(p.how)) w.effect("Effect_Ss_HitMark");
                // z_obj_hamishi.c:183-191: the first hammer hit only shakes it
                if (name === "Obj_Hamishi") w.updateAll();
                const water = p.how === "sinks in deep water";
                let drops = [];
                if (name === "Obj_Kibako2") {
                    // z_obj_kibako2.c:73-100 fragments and dust now, then on the next update the Skulltula (params bit 15 clear) and the drop
                    w.effect("Effect_Ss_Kakera");
                    w.effect("Effect_Ss_Dust");
                    w.updateAll();
                    if (!(a.params & 0x8000)) {
                        const sw = w.spawn("En_Sw", (a.params | 0x8000) & 0xffff, `Skulltula from ${a.tag}`, { home: { pos: a.home.pos.slice(), rot: [0, a.home.rot[1], 0] } });
                        report.skulltula = sw ? Sim.addr(sw.instance) : "did not fit";
                    }
                    const item = (a.home.rot[0] << 16) >> 16;
                    if (item >= 0 && item < 0x1a) drops = lib.dropCollectible(w, a.home.pos.slice(), item | ((a.home.rot[2] & 0x3f) << 8), `drop from ${a.tag}`);
                } else if (name === "Obj_Bombiwa" || name === "Obj_Hamishi") {
                    w.effect("Effect_Ss_Kakera");
                    w.effect("Effect_Ss_Dust");
                    w.setSwitch(a.params & 0x3f);
                    report.switchFlag = Sim.hex(a.params & 0x3f, 2);
                } else {
                    drops = lib.shatter(w, a, water, p);
                    if (name === "En_Kusa" && (a.params & 0x10)) report.bugs = lib.report(lib.bugs(w, a));
                }
                report.drop = lib.report(drops);
                // z_en_kusa.c:326-332: only a type 0 bush is killed; types 1 and 2 stay as a stump
                if (name === "En_Kusa" && (a.params & 3) !== 0) a.cut = true;
                else w.kill(a, `broken (${p.how})`);
                w.updateAll();
                return report;
            },
        },
        liftObject: {
            label: "Pick up a pot, rock, bush or small crate",
            help: "z_obj_tsubo.c:291, z_obj_kibako.c:231, z_en_ishi.c:364-400, z_en_kusa.c:353: lifted, it leaves its room (room -1) so a room change keeps it; a rock with params bit 4 lets out three bugs.",
            params: [{ key: "which", type: "live", label: "What to lift (blank = nearest)", default: "" }],
            run(w, p) {
                const lib = STEPS.breakObject.lib;
                const a = lib.find(w, p.which, (x) => ["Obj_Tsubo", "Obj_Kibako", "En_Ishi", "En_Kusa"].includes(x.info.name) && !x.cut, "pot, rock, bush or small crate");
                if (a.cut) throw new Sim.SimError(`${a.tag} is a cut stump`);
                // z_player.c:7418-7421: a silver boulder needs the Silver Gauntlets (strength not modelled)
                const held = w.allActors().find((x) => x.carried && !x.killed);
                if (held) throw new Sim.SimError(`Link is already carrying ${held.tag}`);
                a.carried = true;
                a.room = -1;
                const report = { lifted: `${a.tag} at ${Sim.addr(a.instance)}` };
                if (a.info.name === "En_Ishi" && (a.params & 0x10)) report.bugs = lib.report(lib.bugs(w, a));
                w.updateAll();
                return report;
            },
        },
        throwObject: {
            label: "Throw what Link carries",
            help: "z_obj_tsubo.c:299-345, z_obj_kibako.c:238-287, z_en_ishi.c:406-500, z_en_kusa.c:359-440: back in the current room, it flies, then breaks where it lands and drops its item.",
            params: [
                { key: "lands", type: "choice", label: "It lands", choices: () => ["on the ground or a wall", "in water", "set down gently (small crate)"], default: "on the ground or a wall" },
                { key: "airFrames", type: "number", label: "Frames in the air", default: 8 },
                { key: "drop", type: "choice", label: "Random drop roll (small rock, bush)", choices: () => STEPS.breakObject.lib.RANDOM, default: "none" },
                { key: "dropCount", type: "number", label: "How many of that drop", default: 1 },
            ],
            run(w, p) {
                const lib = STEPS.breakObject.lib;
                const a = w.allActors().find((x) => x.carried && !x.killed);
                if (!a) throw new Sim.SimError("Link is not carrying anything (use Pick up first)");
                const name = a.info.name;
                a.carried = false;
                a.room = w.curRoom;
                const report = { thrown: `${a.tag} at ${Sim.addr(a.instance)}` };
                // z_obj_kibako.c:241-246: let go with no speed, a crate goes back to Idle
                if (p.lands === "set down gently (small crate)") {
                    if (name !== "Obj_Kibako") throw new Sim.SimError(`${name} is always thrown (ACTOR_FLAG_THROW_ONLY)`);
                    w.updateAll();
                    return report;
                }
                // z_en_ishi.c:409-411: a silver boulder sets its switch flag as it leaves Link's hands
                if (name === "En_Ishi" && (a.params & 1)) {
                    const flag = ((a.params >> 10) & 0x3c) | ((a.params >> 6) & 3);
                    w.setSwitch(flag);
                    report.switchFlag = Sim.hex(flag, 2);
                }
                const water = p.lands === "in water";
                const frames = Math.max(1, Math.min(200, Number(p.airFrames) || 1));
                for (let i = 0; i < frames; i++) {
                    w.updateAll();
                    // z_en_ishi.c:457-475, z_en_kusa.c:407-420: rocks and bushes splash and ripple on touching water, then sink to the bottom
                    if (water && i === 0 && (name === "En_Ishi" || name === "En_Kusa")) {
                        w.effect("Effect_Ss_G_Splash");
                        w.effect("Effect_Ss_G_Ripple");
                    }
                }
                const drops = lib.shatter(w, a, water, p);
                report.drop = lib.report(drops);
                // z_en_kusa.c:392-400: a type 1 bush regrows at home, the others are killed
                if (name === "En_Kusa" && (a.params & 3) === 1) a.room = w.curRoom;
                else w.kill(a, "thrown and broken");
                w.updateAll();
                return report;
            },
        },
        openChest: {
            label: "Open a chest",
            help: "z_player.c:7371-7407 and z_en_box.c:409-445: the long opening spawns Demo_Tre_Lgt (big chests), which mallocs its SkelCurve joints and goes after its light animation; the item over Link's head is drawn by Player from giObjectSegment, not an actor.",
            params: [
                { key: "which", type: "live", label: "Which chest (blank = nearest)", default: "" },
                { key: "long", type: "bool", label: "Long opening (CHEST_ANIM_LONG item Link does not have yet)", default: true },
            ],
            run(w, p) {
                const lib = STEPS.breakObject.lib;
                const chest = lib.find(w, p.which, ["En_Box"], "chest");
                const type = (chest.params >> 12) & 0xf, gi = (chest.params >> 5) & 0x7f, flag = chest.params & 0x1f;
                if (w.chestOpened(flag)) throw new Sim.SimError(`chest flag ${Sim.hex(flag, 2)} is already set`);
                const small = [5, 6, 7, 8].includes(type);
                // GI_ICE_TRAP is GET_ITEM_NONE, so it is always kicked open (z_player.c:7394-7404)
                const ice = gi === 0x7c;
                const long = !!p.long && !ice;
                const report = { chest: `${chest.tag} at ${Sim.addr(chest.instance)}`, getItem: Sim.hex(gi, 2), flag: Sim.hex(flag, 2) };
                if (long && !small) {
                    // z_en_box.c:433-436, z_demo_tre_lgt.c:47-60 and z_fcurve_data_skelanime.c:64: 14 limbs x 18 bytes
                    const light = w.spawn("Demo_Tre_Lgt", 0xffff, `light of ${chest.tag}`, { parent: chest, home: { pos: chest.home.pos.slice(), rot: chest.home.rot.slice() } });
                    // z_demo_tre_lgt.c:65-111: waits for chest frame 10 (5 updates at 2.25), then its curve runs to frame 326 (adult) / 356 (child) at 1.5
                    if (light) w.afterUpdates(light, w.flags.adult ? 216 : 236, () => w.kill(light, "light animation over"));
                    report.light = light ? Sim.addr(light.instance) : "did not fit";
                }
                w.sceneFlags().chests.add(flag);
                w.updateAll();
                if (ice) {
                    // z_en_box.c:559-562 smoke from frame 45 of the lid, then Link breaks out of the ice (z_player.c:14450)
                    w.effect("Effect_Ss_Ice_Smoke");
                    w.effect("Effect_Ss_Ice_Piece");
                }
                return report;
            },
        },
        getItem: {
            label: "Collect an item",
            help: "z_en_item00.c:469-604 and z_player.c:7329-7368: rupees and hearts float over Link for 15 frames; a GI item (key, heart piece, stick...) is killed at once, and one Link already has floats over his head as a new En_Item00; a token (z_en_si.c:101-141) goes when its text closes.",
            params: [{ key: "which", type: "live", label: "Which item (En_Item00, Item_B_Heart, Item_Etcetera, En_Si token; blank = nearest)", default: "" }],
            run(w, p) {
                const lib = STEPS.breakObject.lib;
                const item = lib.find(w, p.which, ["En_Item00", "Item_B_Heart", "Item_Etcetera", "En_Si"], "item");
                const report = { collected: `${item.tag} at ${Sim.addr(item.instance)}` };
                const setCollectible = (flag) => { if (flag > 0 && flag < 0x20) w.sceneFlags().collectibles.add(flag); };
                if (item.info.name === "En_Si") {
                    // z_en_si.c:101-141: Item_Give(ITEM_SKULL_TOKEN) and a textbox, no GI and nothing over Link's head; killed when the text closes
                    w.flags.gsTokens = (w.flags.gsTokens || 0) + 1;
                    w.kill(item, "token collected");
                    w.updateAll();
                    return report;
                }
                if (item.info.name !== "En_Item00") {
                    // z_item_b_heart.c:66-68, z_item_etcetera.c:162-168: killed once Link takes it; the get-item cutscene uses giObjectSegment
                    if (item.info.name === "Item_B_Heart") setCollectible(0x1f);
                    if (item.info.name === "Item_Etcetera" && (item.params & 0xff) === 1) {
                        w.flags.events.add("EVENTCHKINF_31");
                        w.setSwitch(0x0b);
                    }
                    w.kill(item, "collected");
                    w.updateAll();
                    return report;
                }
                if (item.params & 0x8000) throw new Sim.SimError(`${item.tag} is already over Link's head`);
                const type = item.params & 0xff, flag = (item.params >> 8) & 0x3f;
                const gi = { 0x06: "heart piece", 0x07: "heart container", 0x0c: "nuts", 0x0d: "stick", 0x0e: "magic", 0x0f: "magic", 0x10: "seeds", 0x11: "small key", 0x15: "shield", 0x16: "shield", 0x17: "tunic", 0x18: "tunic" }[type];
                if (!gi) {
                    // z_en_item00.c:591-603: collected in place, then EnItem00_Collected floats it for despawnTimer 15 (killed on the 15th update, freed on the 16th)
                    setCollectible(flag);
                    item.params |= 0x8000;
                    w.updateAll();
                    w.afterUpdates(item, 15, () => w.kill(item, "stopped floating"));
                    report.floats = "15 frames over Link's head";
                    return report;
                }
                // z_en_item00.c:572-586: Actor_HasParent -> Flags_SetCollectible and Actor_Kill
                setCollectible(flag);
                w.kill(item, "taken by Link");
                // Item_CheckObtainability (z_parameter.c:1890): items Link has already skip the cutscene
                const have = { stick: w.hasItem("ITEM_DEKU_STICK"), nuts: w.hasItem("ITEM_DEKU_NUT"), seeds: w.hasItem("ITEM_SLINGSHOT"), magic: w.inf("INFTABLE_198") }[gi];
                if (have) {
                    // z_player.c:7306-7321 func_8083E4C4: Item_DropCollectible(dropType | 0x8000) at Link
                    const over = lib.dropCollectible(w, link(w), type | 0x8000, `${gi} over head`)[0];
                    if (over) w.afterUpdates(over, 15, () => w.kill(over, "stopped floating"));
                    report.overHead = over ? Sim.addr(over.instance) : "did not fit";
                } else report.cutscene = "get-item cutscene (GI object into Player's giObjectSegment, no arena)";
                w.updateAll();
                return report;
            },
        },
        catchFairy: {
            label: "Catch or touch a fairy",
            help: "z_player.c:14093-14112 and z_en_elf.c:646-688: a bottled fairy is killed on its next update; a touched one heals Link, circles him and is killed about 100 frames later (z_en_elf.c:715-751).",
            params: [
                { key: "which", type: "live", label: "Which fairy (blank = nearest)", default: "" },
                { key: "how", type: "choice", label: "How", choices: () => ["bottle", "touch"], default: "bottle" },
            ],
            run(w, p) {
                // healing fairies: FAIRY_HEAL_TIMED (2), FAIRY_HEAL (6), FAIRY_HEAL_BIG (7)
                const fairy = STEPS.breakObject.lib.find(w, p.which, (x) => x.info.name === "En_Elf" && [2, 6, 7].includes(x.params), "healing fairy");
                if (p.how === "bottle") {
                    if (fairy.params === 7) throw new Sim.SimError("a big fairy cannot be bottled (FAIRY_FLAG_BIG)");
                    w.kill(fairy, "caught in a bottle");
                    w.updateAll();
                } else {
                    // 20 frames rising, 15 turning, then 1 unit a frame down until 10 below Link's waist
                    w.afterUpdates(fairy, 103, () => w.kill(fairy, "healed Link"));
                    w.updateAll();
                }
                return { fairy: `${fairy.tag} at ${Sim.addr(fairy.instance)}` };
            },
        },
        hitSwitch: {
            label: "Hit a switch or light a torch",
            help: "z_obj_switch.c:261-292, z_obj_syokudai.c:220-235: the switch flag is set (OnePointCutscene_Attention allocates nothing); a type 11 chest with that flag spawns its sparkles, a falling chest drops.",
            params: [
                { key: "which", type: "live", label: "Switch, torch or other actor (blank = use the flag below)", default: "" },
                { key: "flag", type: "hex", label: "Switch flag (blank = the actor's own)", default: "" },
                { key: "action", type: "choice", label: "Do", choices: () => ["turn on", "turn off"], default: "turn on" },
                { key: "stick", type: "bool", label: "Torch lit with a burning Deku stick (its flame spawns Effect_Ss_Dust)", default: false },
            ],
            run(w, p) {
                let flag = p.flag !== "" && p.flag !== undefined ? parseInt(p.flag, 16) & 0x3f : undefined;
                let actor = null;
                if (p.which) {
                    actor = STEPS.breakObject.lib.find(w, p.which, () => true, "actor");
                    if (flag === undefined) {
                        const own = { Obj_Switch: (x) => (x >> 8) & 0x3f, Obj_Syokudai: (x) => x & 0x3f, Obj_Lightswitch: (x) => (x >> 8) & 0x3f, Bg_Bdan_Switch: (x) => (x >> 8) & 0x3f }[actor.info.name];
                        if (!own) throw new Sim.SimError(`give the switch flag for ${actor.info.name}`);
                        flag = own(actor.params);
                    }
                }
                if (flag === undefined) throw new Sim.SimError("pick a switch or give a flag");
                // z_player.c:11461-11474: the burning stick tip spawns dust every frame
                if (p.stick) w.effect("Effect_Ss_Dust");
                const was = w.switchSet(flag);
                if (p.action === "turn off") {
                    w.unsetSwitch(flag);
                    w.updateAll();
                    return { flag: Sim.hex(flag, 2), set: false };
                }
                w.setSwitch(flag);
                const report = { flag: Sim.hex(flag, 2), set: true };
                if (was) {
                    w.updateAll();
                    return report;
                }
                // chests waiting on this flag (z_en_box.c:141-181): hidden type 11, falling types 3 and 8
                const chests = w.live("En_Box").filter((c) => !c.killed && (c.home.rot[2] & 0x3f) === flag && !w.chestOpened(c.params & 0x1f));
                const appear = chests.filter((c) => ((c.params >> 12) & 0xf) === 11);
                const fall = chests.filter((c) => [3, 8].includes((c.params >> 12) & 0xf));
                // z_en_box.c:343-353 the chest sees the flag this frame; AppearInit (appearTimer -30) spawns the sparkles on the next
                w.updateAll();
                const sparkles = [];
                for (const c of appear) {
                    const dk = w.spawn("Demo_Kankyo", 0x11, `sparkles of ${c.tag}`, { home: { pos: c.home.pos.slice(), rot: [0, 0, 0] } });
                    // z_demo_kankyo.c:944-966: killed in Draw once the 20th sparkle finishes its 50-key path (2 frames a key)
                    if (dk) w.afterUpdates(dk, 121, () => w.kill(dk, "sparkles over"));
                    sparkles.push(dk);
                }
                if (appear.length) report.sparkles = STEPS.breakObject.lib.report(sparkles);
                // z_en_box.c:238-285: a falling chest spawns dust each time it lands
                if (fall.length) {
                    w.effect("Effect_Ss_Dust");
                    report.falling = fall.map((c) => c.tag).join(", ");
                }
                w.updateAll();
                return report;
            },
        },
        killEnemy: {
            label: "Kill an enemy",
            help: "Each enemy's own death script (z_en_firefly.c:436-466, z_en_test.c:1573-1657, z_en_sw.c:369-707, ...): effects, BodyBreak blocks and En_Part pieces, the drop (the drop-table roll is picked here), then it is freed; the room's last enemy sets its temporary clear (z_actor.c:3136).",
            params: [
                { key: "which", type: "live", label: "Which enemy (blank = nearest)", default: "" },
                { key: "drop", type: "choice", label: "Drop-table roll", choices: () => STEPS.breakObject.lib.RANDOM, default: "none" },
                { key: "dropCount", type: "number", label: "How many of that drop", default: 1 },
                { key: "hitmark", type: "bool", label: "The killing hit draws a hitmark (sword, arrow, stick...)", default: true },
                { key: "landFrames", type: "number", label: "Updates until it first lands (Keese, Guay, Skulltulas; depends on height)", default: 9 },
                { key: "partRoll", type: "number", label: "Body part timer roll, 0-16 (random per En_Part)", default: 8 },
                { key: "behind", type: "bool", label: "Stalfos hit from behind (falls forwards)", default: false },
                { key: "finish", type: "bool", label: "Play the death out now (else it finishes during later steps)", default: true },
            ],
            // one death script per actor: [update after the hit, what happens]; U0 = the update that sees the hit
            deaths: {
                // z_en_firefly.c:436-466: Die for 40 updates or until it lands, Disappear for 15, then the table 14 drop
                En_Firefly: (c) => {
                    const k = Math.min(39, c.land) + 15;
                    return [[k, () => c.drop("table 14, fromActor")], [k + 1, c.free]];
                },
                // z_en_test.c:1566-1657: fall-over anim (33 frames facing / 41 behind), BodyBreak_Alloc(60), then 24 parts, drop table 13
                En_Test: (c) => {
                    const type = (c.a.params << 16) >> 16;
                    if (type > 3) return null;
                    const k = c.p.behind ? 40 : 32;
                    let bb;
                    return [
                        [k, () => { bb = c.alloc(60); }],
                        [k + 1, () => { c.parts(bb, type === 0 ? 0 : 24, 1); c.drop("table 13, fromActor"); }],
                        [k + 2, c.free],
                    ];
                },
                // z_en_skb.c:430-458: BodyBreak_Alloc(18) and the death sound now, 16 parts next update, drop by size
                En_Skb: (c) => {
                    let bb;
                    const size = (c.a.params << 16) >> 16;
                    return [
                        [0, () => { bb = c.alloc(18); c.w.effect("Effect_Ss_Dead_Sound"); }],
                        [1, () => {
                            c.parts(bb, 16, 1);
                            if (size === 0) c.drop("table 1, fromActor");
                            else if (size <= 5) c.fixed(0x01);
                            else for (let i = 0; i < 3; i++) c.fixed(0x02);
                        }],
                        [2, c.free],
                    ];
                },
                // z_en_tite.c:770-795: death sound and BodyBreak_Alloc(24), then 9 parts (type params + 0xB), blue table 14 / red table 4
                En_Tite: (c) => {
                    let bb;
                    const type = ((c.a.params << 16) >> 16) + 0xb;
                    return [
                        [0, () => { c.w.effect("Effect_Ss_Dead_Sound"); bb = c.alloc(24); }],
                        [1, () => { c.parts(bb, 9, type & 0xffff); c.drop(type === 9 ? "table 14, fromActor" : "table 4, fromActor"); }],
                        [2, c.free],
                    ];
                },
                // z_en_okuta.c:412-455: splash at die-anim frame 15, dust at timer 5, shrinks, then drop table 7 and 20 bubbles
                En_Okuta: (c) => {
                    if ((c.a.params & 0xff) !== 0) return null;
                    return [
                        [26, () => c.w.effect("Effect_Ss_G_Splash")],
                        [40, () => c.w.effect("Effect_Ss_Dust")],
                        [65, () => { c.drop("table 7, fromActor"); c.w.effect("Effect_Ss_Dt_Bubble"); }],
                        [66, c.free],
                    ];
                },
                // z_en_dekunuts.c:432-449: damage anim then die anim; Dead_Db, Hahen burst, drop table 3, its flower becomes a prop
                En_Dekunuts: (c) => {
                    if (c.a.params === 10) return null;
                    return [
                        [24, () => {
                            c.w.effect("Effect_Ss_Dead_Db");
                            c.w.effect("Effect_Ss_Hahen");
                            c.drop("table 3, fromActor");
                            const flower = c.flower(10);
                            if (flower) c.w.changeCategory(flower, 6);
                        }],
                        [25, c.free],
                    ];
                },
                // z_en_hintnuts.c:200-440: beaten with its own nut, it talks, leaves a heart, sinks and goes 100 updates later
                En_Hintnuts: (c) => {
                    if (c.a.params === 0xa) return null;
                    return [
                        [0, () => {
                            c.w.changeCategory(c.a, 1);
                            const heart = c.w.spawn("En_Item00", 0x03, `heart from ${c.a.tag}`, { home: { pos: c.pos.slice(), rot: [0, 0, 0] } });
                            c.spawned.push(heart);
                            if (c.a.params === 3) c.w.sceneFlags().clears.add(c.a.room);
                            const flower = c.flower(0xa);
                            if (flower) c.w.changeCategory(flower, 6);
                        }],
                        [101, c.free],
                    ];
                },
                // z_en_sw.c:349-707: a Skulltula bounces three times (dust), 9 Dead_Db, drop table 3; a gold one leaves its token
                En_Sw: (c) => {
                    let pr = c.a.params & 0xffff;
                    if (pr & 0x8000) pr = (pr & 0x1fff) | (((((pr - 0x8000) >> 13) & 7) + 1) << 13);
                    if (((pr >> 13) & 7) === 0) {
                        const c3 = c.land + 22;
                        return [
                            [c.land, () => c.w.effect("Effect_Ss_Dust")],
                            [c3 + 1, () => c.w.effect("Effect_Ss_Dead_Db")],
                            [c3 + 10, () => c.drop("table 3, no fromActor")],
                            [c3 + 11, c.free],
                        ];
                    }
                    pr = (pr & ~0x1f00) | (((((pr >> 8) & 0x1f) - 1) & 0x1f) << 8);
                    return [
                        [16, () => c.w.effect("Effect_Ss_Dead_Db")],
                        [26, () => {
                            const pos = c.pos.slice();
                            const token = c.w.spawn("En_Si", pr, `token of ${c.a.tag}`, { parent: c.a, home: { pos, rot: [0, 0, 0] } });
                            c.spawned.push(token);
                        }],
                        [27, c.free],
                    ];
                },
                // z_en_st.c:447-1020: bounces (dust each landing), 7 Dead_Db from 20 updates after the third bounce, drop table 14
                En_St: (c) => {
                    const g3 = c.land + 20;
                    return [
                        [c.land, () => c.w.effect("Effect_Ss_Dust")],
                        [g3 + 21, () => c.w.effect("Effect_Ss_Dead_Db")],
                        [g3 + 28, () => c.drop("table 14, no fromActor")],
                        [g3 + 29, c.free],
                    ];
                },
                // z_en_dodojr.c:328-612: three bounces (terrain dependent: 14, 27, 34), 7 red flashes, a bomb, drop table 4
                En_Dodojr: (c) => [
                    [14, () => c.w.effect("Effect_Ss_Dust")],
                    [63, () => c.bomb(0)],
                    [71, () => c.drop("table 4, no fromActor")],
                    [72, c.free],
                ],
                // z_en_crow.c:342-420: falls to the ground, one Dead_Db, shrinks 5 updates, drops; never killed (respawns after 300 updates)
                En_Crow: (c) => [
                    [c.land, () => c.w.effect("Effect_Ss_Dead_Db")],
                    [c.land + 5, () => { if (c.a.params === 1) c.fixed(0x02); else c.drop("table 0, fromActor"); c.done(); }],
                ],
                // z_en_wf.c:1203-1239: Dead_Db every update of the fall-over anim, then drop table 13 and its switch flag
                En_Wf: (c) => [
                    [0, () => c.w.effect("Effect_Ss_Dead_Db")],
                    [24, () => {
                        c.drop("table 13, fromActor");
                        const flag = (c.a.params >> 8) & 0xff;
                        if (flag !== 0xff) c.w.setSwitch(flag & 0x3f);
                    }],
                    [25, c.free],
                ],
                // z_en_bb.c:475-524: death sound, BodyBreak_Alloc(12) at update 5, 6 parts (params 3) and drop table 13 at 6
                En_Bb: (c) => {
                    let pr = c.a.params & 0xffff;
                    if (pr & 0x80) pr |= 0xff00;
                    if (!(pr & 0xff00)) return null;
                    let bb;
                    return [
                        [0, () => c.w.effect("Effect_Ss_Dead_Sound")],
                        [5, () => { bb = c.alloc(12); }],
                        [6, () => { c.parts(bb, 6, 3); c.drop("table 13, fromActor"); }],
                        [7, c.free],
                    ];
                },
                // z_en_rd.c:719-751: drop table 9 at once, turns into a prop, lies there 300 updates, sets its switch flag, fades out
                En_Rd: (c) => [
                    [0, () => { c.drop("table 9, no fromActor"); c.w.changeCategory(c.a, 6); }],
                    [344, () => { const flag = (c.a.params >> 8) & 0x7f; if (flag < 0x40) c.w.setSwitch(flag); }],
                    [396, c.free],
                ],
                // z_en_peehat.c:557-615 larva: 5 Dead_Db, sound, drop table 2 at once; z_en_peehat.c:815-901 adult: shrinks, a bomb, 3 drops (table 4)
                En_Peehat: (c) => {
                    if (((c.a.params << 16) >> 16) === 1) {
                        return [[0, () => { c.w.effect("Effect_Ss_Dead_Db"); c.w.effect("Effect_Ss_Dead_Sound"); c.drop("table 2, fromActor"); }], [1, c.free]];
                    }
                    return [
                        [15, () => c.bomb(0x602)],
                        [19, () => { for (let i = 0; i < 3; i++) c.drop("table 4, fromActor"); }],
                        [20, c.free],
                    ];
                },
            },
            run(w, p) {
                const lib = STEPS.breakObject.lib;
                const deaths = STEPS.killEnemy.deaths;
                // not the flowers of Deku scrubs, nor anything already dying
                const alive = (x) => !x.dying && !(x.info.name === "En_Dekunuts" && x.params === 10) && !(x.info.name === "En_Hintnuts" && x.params === 0xa);
                const a = lib.find(w, p.which, (x) => alive(x) && (p.which || x.category === Sim.CAT_ENEMY || !!deaths[x.info.name]), "enemy");
                if (["En_Dekubaba", "En_Karebaba"].includes(a.info.name)) throw new Sim.SimError("use the Deku Baba steps");
                a.dying = true;
                const spawned = [], partsOut = [];
                const state = { done: false };
                const c = {
                    w, a, p, spawned,
                    pos: a.home.pos.slice(),
                    land: Math.max(1, Number(p.landFrames) || 1),
                    // Item_DropCollectibleRandom with the roll picked in the step (the table and dropFlag are only for the report)
                    drop: (why) => { spawned.push(...lib.dropRandom(w, c.pos, p.drop, p.dropCount, `drop from ${a.tag} (${why})`)); },
                    fixed: (params) => { spawned.push(...lib.dropCollectible(w, c.pos, params, `drop from ${a.tag}`)); },
                    // BodyBreak_Alloc (z_actor.c:3650-3673): matrices, dLists, objectSlots; if one fails the others are freed and no parts come
                    alloc: (count) => {
                        const sizes = [(count + 1) * 0x40, (count + 1) * 4, (count + 1) * 2];
                        const names = ["matrices", "dLists", "objectSlots"];
                        const blocks = [];
                        for (let i = 0; i < 3; i++) {
                            const at = w.allocate(sizes[i], `BodyBreak ${names[i]} of ${a.tag}`, false);
                            if (!at) {
                                for (const b of blocks) w.arena.free(b);
                                return { ok: false, blocks: [] };
                            }
                            blocks.push(at);
                        }
                        return { ok: true, blocks };
                    },
                    // BodyBreak_SpawnParts (z_actor.c:3702-3748): En_Part children, then the three blocks are freed
                    parts: (bb, count, type) => {
                        if (!bb || !bb.ok) return;
                        const base = type === 3 || type === 11 ? 10 : 5;
                        const life = base + Math.max(0, Math.min(16, Number(p.partRoll) || 0));
                        for (let i = 0; i < count; i++) {
                            const part = w.spawn("En_Part", type, `part ${i + 1} of ${a.tag}`, { parent: a, home: { pos: c.pos.slice(), rot: [0, 0, 0] } });
                            partsOut.push(part);
                            // z_en_part.c:84 and 147-152: Dead_Db and Actor_Kill once its timer runs out
                            if (part) w.afterUpdates(part, life + 1, () => { w.effect("Effect_Ss_Dead_Db"); w.afterUpdates(part, 1, () => w.kill(part, "part timer over")); });
                        }
                        for (const b of bb.blocks) w.arena.free(b);
                    },
                    // En_Bom with timer 0 (z_en_bom.c:231-330): explodes on its first update, killed 10 updates later
                    bomb: (rotZ) => {
                        const bomb = w.spawn("En_Bom", 0, `bomb from ${a.tag}`, { home: { pos: c.pos.slice(), rot: [0, 0, rotZ] } });
                        spawned.push(bomb);
                        if (bomb) w.afterUpdates(bomb, 1, () => {
                            ["Effect_Ss_G_Spk", "Effect_Ss_Dust", "Effect_Ss_Bomb2", "Effect_Ss_Blast"].forEach((e) => w.effect(e));
                            w.afterUpdates(bomb, 11, () => w.kill(bomb, "explosion over"));
                        });
                    },
                    flower: (params) => w.live(a.info.name).find((f) => f !== a && f.params === params && !f.killed && f.home && f.home.pos.every((v, i) => v === a.home.pos[i])),
                    done: () => { state.done = true; },
                    // killed on the update before; Actor_RemoveFromCategory sets the room's temp clear if it was the last enemy (z_actor.c:3136)
                    free: () => {
                        state.done = true;
                        if (a.category === Sim.CAT_ENEMY && a.room === w.curRoom && !w.lists[Sim.CAT_ENEMY].some((x) => x !== a)) {
                            (w.tempClears = w.tempClears || new Set()).add(w.curRoom);
                            // z_en_box.c:357-386: room-clear chests set the clear flag and spawn their sparkles on their next update
                            for (const chest of w.live("En_Box").filter((x) => [1, 7].includes((x.params >> 12) & 0xf) && x.room === w.curRoom && !w.chestOpened(x.params & 0x1f))) {
                                w.sceneFlags().clears.add(w.curRoom);
                                w.afterUpdates(chest, 2, () => {
                                    const dk = w.spawn("Demo_Kankyo", 0x11, `sparkles of ${chest.tag}`, { home: { pos: chest.home.pos.slice(), rot: [0, 0, 0] } });
                                    if (dk) w.afterUpdates(dk, 121, () => w.kill(dk, "sparkles over"));
                                });
                            }
                        }
                        w.kill(a, "died");
                    },
                };
                // z_collision_check.c:2556-2566: the hit's hitmark is drawn in the collision check before U0
                if (p.hitmark) w.effect("Effect_Ss_HitMark");
                let events = deaths[a.info.name] ? deaths[a.info.name](c) : null;
                const modelled = !!events;
                // anything else: only the drop and Actor_Kill (its own effects and timing are not modelled)
                if (!events) events = [[0, () => c.drop("roll")], [1, c.free]];
                events = events.slice().sort((x, y) => x[0] - y[0]);
                let now = 0;
                const runFrom = (i) => {
                    while (i < events.length && events[i][0] <= now) events[i++][1]();
                    if (i < events.length) {
                        const next = events[i][0];
                        w.afterUpdates(a, next - now, () => { now = next; runFrom(i); });
                    }
                };
                runFrom(0);
                if (p.finish) for (let n = 0; n < 2000 && !state.done; n++) w.updateAll();
                return {
                    enemy: `${a.info.name} [${a.tag}] at ${Sim.addr(a.instance)}`,
                    death: modelled ? `${events[events.length - 1][0]} updates` : "not modelled for this actor: drop and kill only",
                    spawned: lib.report(spawned),
                    parts: partsOut.length ? `${partsOut.filter(Boolean).length} En_Part, ${Sim.addr(partsOut[0] ? partsOut[0].instance : 0)} first${partsOut.includes(null) ? ", some did not fit" : ""}` : "none",
                    roomClear: w.roomCleared(w.curRoom),
                };
            },
        },
        playSong: {
            label: "Play a song on the ocarina",
            help: "z_message.c:3187-3215, 3441-3457 and 3524-3575, z_player.c:13784-13814: the song spawns its Oceff actor at Link (absolute code space), then the listeners in range react (En_Okarina_Tag, Obj_Timeblock, Obj_Warp2block, En_Gs, En_Box, Shot_Sun, En_Kanban, En_Kakasi2/3, En_Fr, En_Du, En_Md, Bg_Dy_Yoseizo; Song of Storms adds En_Okarina_Effect).",
            params: [
                {
                    key: "song", type: "choice", label: "Song", default: "Zelda's Lullaby",
                    choices: () => ["Zelda's Lullaby", "Saria's Song", "Song of Time", "Song of Storms", "Scarecrow's Song", "Scarecrow's Song for Pierre (Lake Hylia)", "Frogs' choir game (Zora's River log)"],
                },
                { key: "finish", type: "bool", label: "Let everything finish (effects gone, delayed spawns done)", default: true },
            ],
            run(w, p) {
                // id = OcarinaSongId; replay = song length in audio ticks / 3 (general.c:837-975); tag = En_Okarina_Tag song index (z_en_okarina_tag.c:136)
                const SONGS = {
                    "Zelda's Lullaby": { id: 8, quest: "QUEST_SONG_LULLABY", oceff: "Oceff_Wipe", params: 0, life: 101, replay: 110, tag: 2, frog: "EVENTCHKINF_SONGS_FOR_FROGS_ZL" },
                    "Saria's Song": { id: 6, quest: "QUEST_SONG_SARIA", oceff: "Oceff_Wipe3", params: 0, life: 101, replay: 80, tag: 0, frog: "EVENTCHKINF_SONGS_FOR_FROGS_SARIA" },
                    "Song of Time": { id: 10, quest: "QUEST_SONG_TIME", oceff: "Oceff_Wipe", params: 1, life: 101, replay: 109, tag: 4, frog: "EVENTCHKINF_SONGS_FOR_FROGS_SOT" },
                    "Song of Storms": { id: 11, quest: "QUEST_SONG_STORMS", oceff: "Oceff_Storm", params: 0, life: 101, replay: 60, tag: 5, frog: "EVENTCHKINF_SONGS_FOR_FROGS_STORMS" },
                    "Scarecrow's Song": { id: 12, quest: null, oceff: "Oceff_Wipe4", params: 0, life: 51, replay: 50, tag: 6, frog: null },
                };
                const song = p.song || "Zelda's Lullaby";
                const here = w.sceneData ? w.sceneData.enum.replace(/^SCENE_/, "") : "";
                // z_parameter.c sRestrictionFlags: scenes where the ocarina can't be taken out
                const NO_OCARINA = ["CHAMBER_OF_THE_SAGES", "SHOOTING_GALLERY", "CASTLE_COURTYARD_GUARDS_DAY", "CASTLE_COURTYARD_GUARDS_NIGHT", "GANONS_TOWER_COLLAPSE_EXTERIOR",
                    "CASTLE_COURTYARD_ZELDA", "FISHING_POND", "BOMBCHU_BOWLING_ALLEY", "POTION_SHOP_GRANNY", "TREASURE_BOX_SHOP", "DEKU_TREE_BOSS", "DODONGOS_CAVERN_BOSS",
                    "JABU_JABU_BOSS", "FOREST_TEMPLE_BOSS", "SHADOW_TEMPLE_BOSS", "FIRE_TEMPLE_BOSS", "WATER_TEMPLE_BOSS", "SPIRIT_TEMPLE_BOSS", "GANONDORF_BOSS", "GANON_BOSS",
                    "GANONS_TOWER_COLLAPSE_INTERIOR", "INSIDE_GANONS_CASTLE_COLLAPSE"];
                if (NO_OCARINA.includes(here)) throw new Sim.SimError("the ocarina can't be used here");
                const alive = (a) => a && !a.killed && w.allActors().includes(a);
                const live = (name) => w.live(name).filter((a) => !a.killed && !a.initPending && a.home);
                const xz = (a) => (w.linkPos ? Math.hypot(a.home.pos[0] - w.linkPos[0], a.home.pos[2] - w.linkPos[2]) : Infinity);
                const dy = (a) => (w.linkPos ? Math.abs(w.linkPos[1] - a.home.pos[1]) : Infinity);
                const addr = (a) => (a ? Sim.addr(a.instance) : "did not fit");
                const report = { song, reactions: [] };
                const said = (text) => report.reactions.push(text);
                // frame schedule: t = frames since the song was recognised; events run before that frame's Actor_UpdateAll
                const events = new Map();
                const kills = [];
                let lastAct = 0;
                const at = (t, fn) => { if (!events.has(t)) events.set(t, []); events.get(t).push(fn); lastAct = Math.max(lastAct, t); };
                // an actor whose Update calls Actor_Kill on its Kth Update, spawned before frame t0's pass, is freed on frame t0 + K
                const killAt = (t, a, why) => { if (a) kills.push({ t, a, why }); };
                const spawnAt = (name, params, tag, pos, rot) => w.spawn(name, params, tag, { home: { pos: pos.slice(), rot: rot || [0, 0, 0] } });
                // z_demo_effect.c:687-825 time warp: WaitForObject, SkelCurve_Init (2 limbs x 18 bytes), 22 opening Updates, 100 shrinking, Actor_Kill on Update 125
                const timeWarp = (t, pos, big, tag) => {
                    const fx = spawnAt("Demo_Effect", big ? 0x18 : 0x19, tag, pos);
                    if (!fx) return said(`${tag}: Demo_Effect did not fit`);
                    killAt(t + 125, fx, "time warp shrunk");
                    said(`${tag}: Demo_Effect ${Sim.hex(big ? 0x18 : 0x19, 4)} at ${addr(fx)}`);
                };
                // z_demo_kankyo.c:282 and 1030-1036 DEMOKANKYO_SPARKLES: killed from Draw when its last sparkle ends its 52-point path (about 120 frames)
                const sparkles = (t, pos, tag) => {
                    const s = spawnAt("Demo_Kankyo", 0x11, tag, pos);
                    killAt(t + 122, s, "sparkles done");
                    said(`${tag}: Demo_Kankyo sparkles at ${addr(s)}`);
                };
                // z_en_box.c:343-355 and 373-386: a switch-flag chest (type 11) appears on its flag, with sparkles
                const setSwitch = (t, flag, why) => {
                    if (flag < 0 || flag === 0x3f) return;
                    w.setSwitch(flag);
                    said(`${why}: switch ${Sim.hex(flag, 2)} set`);
                    for (const c of live("En_Box").filter((c) => ((c.params >> 12) & 0xf) === 11 && (c.home.rot[2] & 0x3f) === flag && !c.appeared)) {
                        c.appeared = true;
                        at(t + 1, () => sparkles(t + 1, c.home.pos, `chest ${c.tag} appears`));
                    }
                };

                // ---- special flows that aren't free play ----
                if (song === "Frogs' choir game (Zora's River log)") {
                    // z_en_fr.c:633-651 and 846: Link on the log (30 units), all six songs already played -> OCARINA_ACTION_FROGS, no Oceff
                    const log = live("En_Fr").find((a) => a.params === 0 && xz(a) <= 30);
                    if (!log) throw new Sim.SimError("Link is not standing on the frogs' log");
                    const six = ["ZL", "EPONA", "SARIA", "SUNS", "SOT", "STORMS"].every((s) => w.event(`EVENTCHKINF_SONGS_FOR_FROGS_${s}`));
                    if (!six) throw new Sim.SimError("the frogs only play the choir game after all six songs");
                    w.effect("Effect_Ss_G_Splash");
                    const first = !w.event("EVENTCHKINF_SONGS_FOR_FROGS_CHOIR");
                    w.flags.events.add("EVENTCHKINF_SONGS_FOR_FROGS_CHOIR");
                    w.updateAll();
                    return { song, reactions: [`frogs jump out (Effect_Ss_G_Splash); reward ${first ? "heart piece" : "purple rupee"} by GetItem, no actor`] };
                }
                if (song === "Scarecrow's Song for Pierre (Lake Hylia)") {
                    // z_en_kakasi3.c:236-270: within 120 units and facing him; child records it (no Oceff), adult checks it (Oceff_Wipe4, then EVENTCHKINF_9C)
                    const pierre = live("En_Kakasi3").find((a) => xz(a) <= 120);
                    if (!pierre) throw new Sim.SimError("Pierre (En_Kakasi3) is not within 120 units");
                    if (!w.flags.adult) {
                        w.updateAll();
                        return { song, reactions: ["child records the Scarecrow's Song (scarecrowSpawnSongSet); recording spawns no Oceff"] };
                    }
                    const fx = w.spawn("Oceff_Wipe4", 0, "Scarecrow's Song effect", { home: { pos: link(w), rot: [0, 0, 0] } });
                    if (fx) w.afterUpdates(fx, 52, () => w.kill(fx, "effect over"));
                    w.flags.events.add("EVENTCHKINF_9C");
                    w.updateAll();
                    if (p.finish && fx) for (let i = 0; i < 60 && alive(fx); i++) w.updateAll();
                    return { song, effect: addr(fx), reactions: ["Pierre accepts the song: EVENTCHKINF_9C set (after the text)"] };
                }

                const S = SONGS[song];
                if (!S) throw new Sim.SimError(`unknown song ${song}`);
                if (S.quest && !w.hasQuest(S.quest)) throw new Sim.SimError(`Link doesn't know ${song}`);
                // effect at t=30 (20 frames MSGMODE_OCARINA_CORRECT_PLAYBACK + 10 MSGMODE_SONG_PLAYED); mode set R, text closed (free play -> OCARINA_MODE_04) R+2
                const T_FX = 30;
                const R = T_FX + S.replay + 24;
                const FREE04 = R + 2;

                // ---- who listens when Link takes out the ocarina (t=0) ----
                // listeners that call Message_StartOcarina: the last one in update order sets the ocarina action
                const starters = [];
                const checks = [];
                const frogLog = live("En_Fr").find((a) => a.params === 0 && xz(a) <= 30 && w.linkPos && w.linkPos[1] >= a.home.pos[1]);
                if (frogLog) {
                    // z_en_fr.c:633-701: the frogs take over (CHECK_NOWARP); they jump out of the water first
                    w.effect("Effect_Ss_G_Splash");
                    said("frogs jump out onto the log (Effect_Ss_G_Splash)");
                    starters.push({ a: frogLog, check: true });
                    checks.push({
                        a: frogLog,
                        react: (mode) => {
                            if (!S.frog) return mode;
                            const first = !w.event(S.frog);
                            w.flags.events.add(S.frog);
                            said(`frogs: ${S.frog} set, reward ${S.id === 11 ? (first ? "heart piece" : "blue rupee") : first ? "purple rupee" : "blue rupee"} by GetItem (no actor)`);
                            return mode;
                        },
                    });
                }
                // z_en_okarina_tag.c:120-240
                for (const tag of frogLog ? [] : live("En_Okarina_Tag")) {
                    const type = (tag.params >> 10) & 0x3f;
                    const tsong = (tag.params >> 6) & 0xf;
                    const flag = tag.params & 0x3f;
                    const range = tag.home.rot[2] > 0 ? tag.home.rot[2] * 40 : 0;
                    if (flag !== 0x3f && w.switchSet(flag)) continue;
                    if (type === 7) {
                        // needs player->unk_6A8 (within 50 + range, 40 high) so Link aims the ocarina at it
                        if (tsong === 6) continue; // Scarecrow's Song tags are not modelled (see NOTES)
                        if (!(xz(tag) < 50 + range && dy(tag) < 40)) continue;
                        starters.push({ a: tag, check: true });
                        checks.push({
                            a: tag,
                            react: (mode) => {
                                const any = tsong === 0xf;
                                if (mode === 3 || (any && [5, 6, 7, 8, 9, 10, 13].includes(mode))) {
                                    setSwitch(R, flag, `ocarina spot ${tag.tag}`);
                                    return w.sceneName === "daiyousei_izumi" || w.sceneName === "yousei_izumi_yoko" ? mode : 4;
                                }
                                return mode >= 5 && mode < 14 ? 4 : mode;
                            },
                            song: tsong === 0xf ? 0 : tsong,
                        });
                    } else if ([1, 2, 4, 6].includes(type)) {
                        if (type === 4 && w.event("EVENTCHKINF_OPENED_DOOR_OF_TIME")) continue;
                        if (type === 6 && w.event("EVENTCHKINF_1D")) continue;
                        if (!(xz(tag) < 90 + range && dy(tag) < 80)) continue;
                        const want = { 1: 2, 2: 5, 4: 4, 6: 2 }[type];
                        starters.push({ a: tag, check: true });
                        checks.push({
                            a: tag,
                            song: want,
                            react: (mode) => {
                                if (mode !== 3) return mode >= 5 && mode < 14 ? 4 : mode;
                                setSwitch(R, flag, `ocarina spot ${tag.tag}`);
                                if (type === 1) {
                                    w.flags.events.add("EVENTCHKINF_39");
                                    said(`ocarina spot ${tag.tag}: EVENTCHKINF_39 set`);
                                } else if (type === 2) {
                                    w.setActorPointer("En_Okarina_Tag", 0xae0, "gWindmillSpinningFasterCs");
                                    w.flags.events.add("EVENTCHKINF_65");
                                    said("windmill spins faster: cutscene gWindmillSpinningFasterCs");
                                } else if (type === 4) {
                                    w.setActorPointer("En_Okarina_Tag", 0xc50, "gDoorOfTimeOpeningCs");
                                    said("Door of Time opens: cutscene gDoorOfTimeOpeningCs");
                                } else {
                                    const name = w.flags.adult ? "gGraveyardTombOpeningAdultCs" : "gGraveyardTombOpeningChildCs";
                                    w.setScenePointer(name, "Royal Family's Tomb opens");
                                    w.flags.events.add("EVENTCHKINF_1D");
                                    said(`royal tomb opens: cutscene ${name}, EVENTCHKINF_1D set`);
                                }
                                return 4;
                            },
                        });
                    }
                }
                // z_en_du.c:333-372: child Darunia listens within 116 + 20; Saria's Song is right, any other song wrong (Sun's Song disabled)
                for (const du of frogLog ? [] : live("En_Du").filter((a) => !w.flags.adult && w.sceneName === "spot18" && xz(a) < 136)) {
                    starters.push({ a: du, check: true });
                    checks.push({
                        a: du,
                        song: 0,
                        react: (mode) => {
                            if (mode === 3) { w.setScenePointer("gGoronCityDaruniaCorrectSongCs", "Darunia dances"); said("Darunia: gGoronCityDaruniaCorrectSongCs"); return 4; }
                            if (mode >= 6) { w.setScenePointer("gGoronCityDaruniaWrongSongCs", "Darunia dislikes the song"); said("Darunia: gGoronCityDaruniaWrongSongCs"); return 4; }
                            return mode;
                        },
                    });
                }
                // z_en_md.c:790-825: Mido in the Lost Woods within 30 + 36
                for (const md of frogLog ? [] : live("En_Md").filter((a) => w.sceneName === "spot10" && xz(a) < 66)) {
                    starters.push({ a: md, check: true });
                    checks.push({
                        a: md,
                        song: 0,
                        react: (mode) => {
                            if (mode === 3) { w.flags.events.add("EVENTCHKINF_0A"); said("Mido: offers talk (text 0x1067), which sets EVENTCHKINF_0A; he walks away"); return 4; }
                            return mode >= 4 ? 4 : mode;
                        },
                    });
                }
                const free = [];
                if (!frogLog) {
                    // z_en_gs.c:156-191: gossip stone within 100
                    for (const gs of live("En_Gs").filter((a) => xz(a) <= 100)) {
                        starters.push({ a: gs, check: false });
                        free.push(() => {
                            const type = [6, 8, 10].includes(S.id) ? 2 : S.id === 11 ? 7 : -1;
                            if (type > 0) {
                                const fairy = spawnAt("En_Elf", type, `fairy from ${gs.tag}`, [gs.home.pos[0], gs.home.pos[1] + 40, gs.home.pos[2]]);
                                said(`gossip stone ${gs.tag}: En_Elf ${type} at ${addr(fairy)}`);
                            }
                            setSwitch(FREE04, (gs.params >> 8) & 0x3f, `gossip stone ${gs.tag}`);
                        });
                    }
                    // z_en_box.c:306-340: Zelda's Lullaby chest (type 9) within 150
                    for (const c of live("En_Box").filter((c) => ((c.params >> 12) & 0xf) === 9 && !c.appeared && !w.chestOpened(c.params & 0x1f) && w.near(c, 150))) {
                        starters.push({ a: c, check: false });
                        if (S.id === 8) free.push(() => { c.appeared = true; at(FREE04 + 1, () => sparkles(FREE04 + 1, c.home.pos, `chest ${c.tag} appears`)); });
                    }
                    // z_shot_sun.c:141-172: Song of Storms fairy spot (params 0x41) within 150
                    for (const s of live("Shot_Sun").filter((a) => (a.params & 0xff) === 0x41 && w.near(a, 150))) {
                        starters.push({ a: s, check: false });
                        if (S.id === 11) {
                            free.push(() => at(FREE04 + 1, () => {
                                sparkles(FREE04 + 1, s.home.pos, `Storms fairy spot ${s.tag}`);
                                at(FREE04 + 51, () => {
                                    const fairy = spawnAt("En_Elf", 7, `big fairy from ${s.tag}`, s.home.pos);
                                    w.kill(s, "fairy spawned");
                                    said(`Storms fairy spot ${s.tag}: En_Elf 7 at ${addr(fairy)}, spot killed`);
                                });
                            }));
                        }
                    }
                    // z_en_kanban.c:748-798: pieces of a cut sign fly back on Zelda's Lullaby and are killed once in place
                    if (S.id === 8) {
                        for (const piece of live("En_Kanban").filter((a) => a.params === 0xffdd)) {
                            free.push(() => { killAt(FREE04 + 64, piece, "sign repaired"); said(`sign piece ${piece.tag} flies back (killed in about 64 frames)`); });
                        }
                    }
                }
                // z_obj_timeblock.c:167-205: in range (not standing inside it); fires 110 frames after the song is recognised
                const blocks = frogLog ? [] : live("Obj_Timeblock");
                const listeningBlocks = blocks.filter((b) => (!(b.params & 0x400) || b.timeVisible !== false) && xz(b) <= [60, 100, 140, 180, 220, 260, 300, 300][(b.params >> 11) & 7] && xz(b) > (b.params & 0x100 ? 0.6 : 1) * 50 + 6);
                for (const b of listeningBlocks) starters.push({ a: b, check: false });
                // z_obj_warp2block.c:94-208: an active block (bit 15) and its partner; either in range
                const warps = [];
                for (const b of frogLog ? [] : live("Obj_Warp2block").filter((o) => o.params & 0x8000)) {
                    const partner = live("Obj_Warp2block").find((o) => o !== b && !(o.params & 0x8000) && (o.params & 0x3f) === (b.params & 0x3f));
                    if (!partner) continue;
                    const reach = (o) => xz(o) <= [60, 100, 140, 180, 220, 260, 300, 300][(o.params >> 11) & 7];
                    const inside = (o) => xz(o) <= (o.params & 0x100 ? 0.6 : 1) * 50 + 6;
                    if ((reach(b) || reach(partner)) && !inside(b) && !inside(partner)) { warps.push([b, partner]); starters.push({ a: b, check: false }); }
                }

                // the ocarina action: the last listener in Actor_UpdateAll order that started it; none -> Player's free play
                const order = w.allActors();
                starters.sort((x, y) => order.indexOf(x.a) - order.indexOf(y.a));
                const winner = starters.length ? starters[starters.length - 1] : null;
                report.listener = winner ? `${winner.a.info.name} ${winner.a.tag}` : "none (free play)";
                const winCheck = winner && winner.check ? checks.find((c) => c.a === winner.a) : null;

                // ---- the effect ----
                at(T_FX, () => {
                    const fx = w.spawn(S.oceff, S.params, `${song} effect`, { home: { pos: link(w), rot: [0, 0, 0] } });
                    report.effect = addr(fx);
                    killAt(T_FX + S.life, fx, "song effect over");
                    if (fx && S.oceff === "Oceff_Storm") {
                        // z_oceff_storm.c:59-64 and z_en_okarina_effect.c:61-128: storm manager 30 units below Link; 400-frame storm, CutsceneFlags 5 on its 93rd Update
                        const storm = w.spawn("En_Okarina_Effect", 1, "Song of Storms rain", { home: { pos: [w.linkPos ? w.linkPos[0] : 0, (w.linkPos ? w.linkPos[1] : 0) - 30, w.linkPos ? w.linkPos[2] : 0], rot: [0, 0, 0] } });
                        report.storm = addr(storm);
                        killAt(T_FX + 401, storm, "storm over");
                        if (storm) at(T_FX + 93, () => stormFlag(T_FX + 93));
                    }
                });
                // CutsceneFlags 5 ("beans, grow!") is read by Door_Ana, Obj_Bean, Bg_Spot11_Oasis and Bg_Relay_Objects
                const stormFlag = (t) => {
                    for (const g of live("Door_Ana").filter((a) => (a.params & 0x300) && !(a.params & 0x200) && w.near(a, 200))) {
                        g.params &= ~0x300;
                        said(`storms grotto ${g.tag} opens (params now ${Sim.hex(g.params, 4)})`);
                    }
                    const bean = live("Obj_Bean").find((a) => !w.flags.adult && w.switchSet(a.params & 0x3f) && !a.watered && xz(a) < 50);
                    if (bean) {
                        // z_obj_bean.c:651-727: 50 + 100 frames of growth, then 3 ITEM00_FLEXIBLE drops 30 frames into phase 3
                        bean.watered = true;
                        said(`bean sprout ${bean.tag} grows`);
                        at(t + 181, () => {
                            const pos = [bean.home.pos[0], bean.home.pos[1] + 55, bean.home.pos[2]];
                            const drops = [];
                            for (let i = 0; i < 3; i++) drops.push(...STEPS.breakObject.lib.dropCollectible(w, pos, 0x11, `bean drop ${i + 1}`));
                            said(`bean drops: ${STEPS.breakObject.lib.report(drops)}`);
                        });
                    }
                    for (const o of live("Bg_Spot11_Oasis").filter((a) => w.near(a, 400) && !a.risen)) {
                        // z_bg_spot11_oasis.c:112-132: rises 0.7/frame from -100 to 0, then En_Elf FAIRY_SPAWNER 40 above
                        o.risen = true;
                        said("oasis fills");
                        at(t + 143, () => {
                            const sp = spawnAt("En_Elf", 4, "oasis fairy spawner", [o.home.pos[0], 40, o.home.pos[2]]);
                            said(`oasis: En_Elf 4 (fairy spawner) at ${addr(sp)}`);
                        });
                    }
                    if (w.live("Bg_Relay_Objects").length) { w.flags.events.add("EVENTCHKINF_65"); said("windmill gear speeds up: EVENTCHKINF_65"); }
                };

                // ---- time blocks and warp blocks: 110 frames after recognition, only for the Song of Time ----
                if (S.id === 10) {
                    at(110, () => {
                        const flagsBefore = new Map(blocks.map((b) => [b, w.switchSet(b.params & 0x3f)]));
                        for (const b of listeningBlocks) {
                            timeWarp(110, b.home.pos, !(b.params & 0x100), `time block ${b.tag}`);
                            if (b.params & 0x40) {
                                b.params ^= 0x8000;
                            } else if (w.switchSet(b.params & 0x3f)) {
                                w.unsetSwitch(b.params & 0x3f);
                                said(`time block ${b.tag}: switch ${Sim.hex(b.params & 0x3f, 2)} cleared`);
                            } else {
                                setSwitch(110, b.params & 0x3f, `time block ${b.tag}`);
                            }
                        }
                        // z_obj_timeblock.c:316-339: a hidden alt block (bit 10) whose flag now makes it appear spawns its own warp next frame
                        at(111, () => {
                            for (const b of blocks.filter((b) => (b.params & 0x400) && !listeningBlocks.includes(b))) {
                                const now = w.switchSet(b.params & 0x3f);
                                if (now !== flagsBefore.get(b) && (now !== !!(b.params & 0x8000))) timeWarp(111, b.home.pos, !(b.params & 0x100), `time block ${b.tag} appears`);
                            }
                        });
                        for (const [b, partner] of warps) {
                            timeWarp(110, b.home.pos, !(b.params & 0x100), `warp block ${b.tag}`);
                            timeWarp(110, partner.home.pos, !(partner.params & 0x100), `warp block partner ${partner.tag}`);
                            at(122, () => {
                                // z_obj_warp2block.c:124-171: the pair swaps places; switch set when away from home
                                const pos = b.home.pos;
                                b.home = { pos: partner.home.pos, rot: b.home.rot };
                                partner.home = { pos, rot: partner.home.rot };
                                b.warpSwapped = !b.warpSwapped;
                                if (b.warpSwapped) setSwitch(122, b.params & 0x3f, `warp block ${b.tag}`);
                                else { w.unsetSwitch(b.params & 0x3f); said(`warp block ${b.tag}: switch cleared`); }
                            });
                        }
                    });
                }

                // ---- OCARINA_MODE results (z_message.c:3524-3575) ----
                at(R, () => {
                    let mode;
                    if (winCheck) mode = winCheck.song === undefined ? 1 : winCheck.song === S.tag ? 3 : S.id - 1;
                    else mode = S.id === 12 ? 0x0b : 1;
                    if (frogLog) mode = S.id - 1;
                    // CHECK listeners in update order: the first that handles the mode usually resets it to 04
                    for (const c of checks.slice().sort((x, y) => order.indexOf(x.a) - order.indexOf(y.a))) {
                        if (alive(c.a)) mode = c.react(mode);
                    }
                    // z_en_kakasi2.c:151-181: Pierre rises on OCARINA_MODE_0B (Scarecrow's Song) within his range once EVENTCHKINF_9C is set
                    if (S.id === 12 && w.event("EVENTCHKINF_9C")) {
                        for (const k of live("En_Kakasi2")) {
                            const flag = k.params & 0x3f;
                            if (k.risen || (flag !== 0x3f && w.switchSet(flag))) continue;
                            if (!(xz(k) < ((k.params >> 6) & 0xff) * 40 + 40 && dy(k) < k.home.rot[2] * 40 + 40)) continue;
                            k.risen = true;
                            setSwitch(R, flag, `Pierre ${k.tag}`);
                            // SkelAnime_InitFlex with NULL tables: jointTable and morphTable, never freed
                            w.allocate(0xa8, "En_Kakasi2 jointTable", false);
                            w.allocate(0xa8, "En_Kakasi2 morphTable", false);
                            said(`Pierre ${k.tag} rises: 2 x 0xA8 skeleton tables`);
                            break;
                        }
                    }
                    if (S.id === 6 && !winCheck) said("free play Saria's Song: Navi talks (naviTextId -0xE0), no actor");
                    report.ocarinaMode = Sim.hex(mode, 2);
                });
                // Bg_Dy_Yoseizo (z_bg_dy_yoseizo.c:237-373): switch 0x38 from the fountain's ocarina spot
                at(R + 1, () => {
                    for (const gf of live("Bg_Dy_Yoseizo")) {
                        if (!w.switchSet(0x38) || gf.answered) continue;
                        gf.answered = true;
                        const magic = w.sceneName === "daiyousei_izumi";
                        const reward = Math.max(0, w.spawnIndex || 0);
                        const spells = [["ITEMGETINF_FARORES_WIND", "gGreatFairyFaroresWindCs"], ["ITEMGETINF_DINS_FIRE", "gGreatFairyDinsFireCs"], ["ITEMGETINF_NAYRUS_LOVE", "gGreatFairyNayrusLoveCs"]];
                        const name = magic ? ["gGreatFairyMagicCs", "gGreatFairyDoubleMagicCs", "gGreatFairyDoubleDefenseCs"][reward] : spells[reward] && spells[reward][1];
                        const isNew = magic ? true : spells[reward] && !w.itemGetInf(spells[reward][0]);
                        if (name && isNew) {
                            w.setScenePointer(name, "Great Fairy's reward");
                            said(`Great Fairy: cutscene ${name}`);
                        } else {
                            said("Great Fairy: revisit (no cutscene script; heals Link, En_Dy_Extra beam later)");
                        }
                    }
                });
                at(FREE04, () => { for (const fn of free) fn(); });

                // ---- run the frames ----
                const maxKill = kills.length ? Math.max(...kills.map((k) => k.t)) : 0;
                let t = 0;
                const runFrame = () => {
                    for (const fn of events.get(t) || []) fn();
                    for (const k of kills.filter((k) => k.t === t)) if (alive(k.a)) w.kill(k.a, k.why);
                    w.updateAll();
                    t++;
                };
                while (t <= lastAct) runFrame();
                if (p.finish) {
                    while (t <= Math.max(lastAct, ...kills.map((k) => k.t), maxKill)) runFrame();
                } else {
                    // hand what is still pending to the actors themselves
                    for (const k of kills.filter((k) => k.t >= t && alive(k.a) && !k.a.afterUpdates)) w.afterUpdates(k.a, k.t - t + 1, () => w.kill(k.a, k.why));
                }
                if (!report.reactions.length) report.reactions.push("no listener reacted");
                return report;
            },
        },
    };

    const step = (type, params = {}, note) => ({ type, params, ...(note ? { note } : {}) });
    const LACS_FLAGS = {
        adult: false, night: false, japanese: false, infs: [], quests: ["QUEST_SONG_LULLABY"], items: ["ITEM_OCARINA_FAIRY"],
        events: ["EVENTCHKINF_OBTAINED_ZELDAS_LETTER"], scenes: { spot04: { collectibles: [0x11] } },
    };
    // Kokiri Forest part of the setup: leaves the pointer at the Deku Tree's code + 0xFF0 = 801FAAA0 on console
    const LACS_KOKIRI_FOREST = [
        step("boot"),
        step("savewarp", { entrance: "ENTR_LINKS_HOUSE_0" }),
        step("enter", { entrance: "ENTR_KOKIRI_FOREST_3" }),
        step("room", { room: 1 }, "Walk to the Deku Tree area."),
        step("enter", { entrance: "ENTR_DEKU_TREE_0" }, "Hover in to the Deku Tree (plays its intro)."),
        step("enter", { entrance: "ENTR_KOKIRI_FOREST_1" }, "Leave."),
        step("talkDekuTree", { part: "meeting" }),
        step("talkDekuTree", { part: "no" }, "Say no."),
        step("killWitheredBaba"),
        step("killWitheredBaba"),
        step("collectItem", { item: "stick", tag: "stick 1" }),
        step("collectItem", { item: "stick", tag: "stick 2" }, "Before the first stick icon goes."),
        step("itemGone", { which: "stick 1" }),
        step("pullChu", { tag: "chu 1" }, "Before the second stick icon goes."),
        step("itemGone", { which: "stick 2" }),
        step("room", { room: 0, onScreen: "#2" }, "Into the main area. The camera looks down the Baba corridor, so the nearest Baba is on screen."),
        step("room", { room: 1 }, "Back to the Deku Tree area."),
        step("room", { room: 0, onScreen: "#1,#2" }, "Into the main area again, with the two corridor Babas on screen."),
        step("dropChu"),
        step("pullChu", { tag: "chu 2" }),
        step("chuExplodes", { which: "chu 1" }),
        step("dropChu"),
        step("pullChu", { tag: "chu 3" }),
        step("chuExplodes", { which: "chu 2" }),
        step("room", { room: 1 }, "Back to the Deku Tree area: its code loads at 801F9AB0."),
        step("talkDekuTree", { part: "choice" }),
        step("talkDekuTree", { part: "yes" }, "Finish talking to the Deku Tree: pointer 801FAAA0."),
    ];
    // Deku Tree part: the angle chu lands on the pointer, then the death on the blue warp loads Dodongo's Cavern
    const LACS_DEKU_TREE = [
        step("enter", { entrance: "ENTR_DEKU_TREE_0" }, "Reenter the Deku Tree."),
        step("killDekuBaba", {}, "Kill the baba and collect its nut."),
        step("collectItem", { item: "nut", tag: "nut over head" }),
        step("itemGone"),
        step("linkAt", { x: 0, y: 0, z: 0 }, "Where the angle setup ends; the chu's height must be 0.0 for the first skip to be 0."),
        step("releaseBugs"),
        step("pullChu", { angle: "78D1", tag: "angle chu" }, "Angle 0x78D1 from the setup."),
        step("dropChu", {}, "Shield drop."),
        step("catchBugs"),
        step("chuExplodes", { which: "angle chu" }, "Its bytes stay at 801FAAA0."),
        step("enter", { entrance: "ENTR_DEKU_TREE_BOSS_0" }, "Go down to Gohma."),
        step("wrongWarp", { entrance: "ENTR_DEKU_TREE_0", cutsceneIndex: "FFF1", gameOver: true }, "Kill Gohma and die on the blue warp frame: Continue loads the Deku Tree entrance + cutscene layer 5 = Dodongo's Cavern."),
    ];
    const EXAMPLES = {
        lacsFull: {
            label: "LACS bombchu wrong warp (full route)",
            state: { flags: LACS_FLAGS, steps: [...LACS_KOKIRI_FOREST, ...LACS_DEKU_TREE] },
        },
        lacsKokiriForest: {
            label: "LACS setup: Kokiri Forest part only",
            state: { flags: LACS_FLAGS, steps: LACS_KOKIRI_FOREST },
        },
    };

    const rules = {
        STEPS,
        INIT,
        CUES,
        gameOverEntrance,
        ACTIONS,
        ACTION_LABELS,
        FLAGS,
        sceneFlagList,
        EXAMPLES,
        init(w, actor) {
            const rule = INIT[actor.info.name];
            if (rule) rule(w, actor);
        },
        // Each Update while a cutscene plays, for actors that act on their cue
        cue(w, actor) {
            const rule = CUES[actor.info.name];
            if (rule) rule(w, actor);
        },
        onSceneStart(w) {},
        onPlayInit(w) {
            playerHorse(w);
        },
        // Navi's sparkle trail loads its effect once the scene is running
        onSceneSettled(w) {
            w.effect("Effect_Ss_KiraKira");
        },
    };

    // Event and info flags the Init rules read, for the "other flags" hints
    rules.referencedFlags = [...new Set(Object.values(INIT).flatMap((f) => [...String(f).matchAll(/w\.(?:event|inf|itemGetInf)\("(\w+)"\)/g)].map((m) => m[1])))].sort();

    root.N64Rules = rules;
})(typeof window !== "undefined" ? window : globalThis);
