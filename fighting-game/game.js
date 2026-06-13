const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 1000;
canvas.height = 600;

let gravity = 0.7;
const groundLevel = canvas.height - 50;

class Player {
    constructor(x, y, color, controls) {
        this.x = x;
        this.y = y;
        this.width = 50;
        this.height = 60;
        this.color = color;
        this.velocityX = 0;
        this.velocityY = 0;
        this.speed = 5;
        this.baseSpeed = 5;
        this.jumpPower = 15;
        this.isGrounded = false;
        this.health = 100;
        this.maxHealth = 100;
        this.controls = controls;
        this.isAttacking = false;
        this.attackCooldown = 0;
        this.attackDuration = 10;
        this.attackTimer = 0;
        this.attackDamage = 10;
        this.baseAttackDamage = 10;
        this.defense = 1.0;
        this.facing = 1;
        this.knockback = 0;
        this.stunTimer = 0;
        this.isJumping = false;
        this.jumpReleased = false;
        this.jumpCutoffMultiplier = 0.4;
        this.powerupActive = false;
        this.powerupDuration = 0;
        this.powerupCooldown = 0;
        this.dropThroughTimer = 0;
        this.stretchY = 1;
        this.stretchX = 1;
        this.landingSquash = 0;
        this.wasInAir = false;
        this.autoFire = false;
        this.autoJump = false;
        this.jumpDisabled = false;
        // Gunning mode properties
        this.gunningHealth = 15;
        this.maxGunningHealth = 15;
        this.gunCooldown = 0;
        this.baseCooldown = 40; // Base cooldown for shooting
        this.superGunActive = false;
        this.shieldsCollected = 0;  // Track shields for healing in Gunning mode
        this.superBulletsRemaining = 0;  // Track how many super bullets to spawn
        this.superBulletTimer = 0;  // Timer for spawning super bullets
    }
    
    shoot() {
        if (gameMode === 'gunning' && this.gunCooldown <= 0 && this.superBulletsRemaining === 0) {
            // Only shoot normal bullets when not in super mode
            const target = this === player1 ? player2 : player1;
            const bulletSpeed = this.speed * 0.6666;
            const bullet = new Bullet(
                this.x + this.width / 2,
                this.y + this.height / 2,
                target.x + target.width / 2,
                target.y + target.height / 2,
                bulletSpeed,
                this === player1 ? 'player1' : 'player2',
                false
            );
            bullets.push(bullet);
            this.gunCooldown = this.baseCooldown;
        }
    }
    
    spawnSuperBullet() {
        // Spawn a single super bullet
        const target = this === player1 ? player2 : player1;
        const bulletSpeed = this.speed * 1.2;
        const bullet = new Bullet(
            this.x + this.width / 2,
            this.y + this.height / 2,
            target.x + target.width / 2,
            target.y + target.height / 2,
            bulletSpeed,
            this === player1 ? 'player1' : 'player2',
            true  // isSuper = true
        );
        bullets.push(bullet);
    }

    update(otherPlayer) {
        if (this.stunTimer > 0) {
            this.stunTimer--;
        }

        if (this.stunTimer <= 0) {
            if (keys[this.controls.left]) {
                this.velocityX = -this.speed;
                this.facing = -1;
            } else if (keys[this.controls.right]) {
                this.velocityX = this.speed;
                this.facing = 1;
            } else {
                this.velocityX *= 0.8;
            }

            if ((keys[this.controls.jump] || this.autoJump) && !keys[this.controls.down] && this.isGrounded && !this.jumpDisabled) {
                this.velocityY = -this.jumpPower;
                this.isJumping = true;
                this.jumpReleased = false;
                this.stretchY = 1.4;
                this.stretchX = 0.7;
            } else if (keys[this.controls.down] && !keys[this.controls.jump] && this.isGrounded) {
                platforms.forEach(platform => {
                    if (this.x < platform.x + platform.width &&
                        this.x + this.width > platform.x &&
                        Math.abs(this.y + this.height - platform.y) < 5) {
                        this.dropThroughTimer = 15;
                        this.y += 20;
                        this.isGrounded = false;
                    }
                });
            }

            if (!keys[this.controls.jump] && this.isJumping && !this.jumpReleased && !this.autoJump) {
                this.jumpReleased = true;
                if (this.velocityY < 0) {
                    this.velocityY *= this.jumpCutoffMultiplier;
                }
            }

            if ((keys[this.controls.attack] || this.autoFire) && this.attackCooldown <= 0) {
                if (gameMode === 'gunning') {
                    this.shoot();
                } else {
                    this.attack();
                }
            }

            if (keys[this.controls.powerup] && this.powerupCooldown <= 0 && !this.powerupActive) {
                this.activatePowerup();
            }
        }

        this.velocityX += this.knockback;
        this.knockback *= 0.9;

        this.x += this.velocityX;
        
        if (this.jumpReleased && this.velocityY < 0) {
            this.velocityY += gravity * 2.5;
        } else {
            this.velocityY += gravity;
        }

        // Apply initial fall speed when starting to fall (capped by maxFallSpeed)
        // Only apply if already in the air (wasInAir), not when just stepping off a platform
        const cappedInitialFall = Math.min(initialFallSpeed, maxFallSpeed);
        if (this.wasInAir && this.velocityY > 0 && this.velocityY < cappedInitialFall) {
            this.velocityY = cappedInitialFall;
        }

        // Cap falling speed to prevent glitching through platforms
        if (this.velocityY > maxFallSpeed) {
            this.velocityY = maxFallSpeed;
        }

        this.y += this.velocityY;

        // Track if player is in the air (for initial fall speed check)
        if (!this.isGrounded) {
            this.wasInAir = true;
        }

        this.isGrounded = false;

        // Only use ground collision in non-Platform Arena and non-Gunning modes
        if (gameMode !== 'platformArena' && gameMode !== 'gunning') {
            if (this.y + this.height >= groundLevel) {
                this.y = groundLevel - this.height;
                this.velocityY = 0;
                this.isGrounded = true;
                this.isJumping = false;
                this.jumpReleased = false;
                this.wasInAir = false;
            }

            // Invisible ceiling for classic and best of three modes
            if (this.y < 0) {
                this.y = 0;
                this.velocityY = 0;
            }
        }

        if (this.dropThroughTimer > 0) {
            this.dropThroughTimer--;
        }

        platforms.forEach(platform => {
            // Skip platform collision if jumpDisabled is active (fall through)
            const fallThrough = this.jumpDisabled;
            if (!fallThrough &&
                this.dropThroughTimer <= 0 &&
                this.velocityY > 0 &&
                this.x < platform.x + platform.width &&
                this.x + this.width > platform.x &&
                this.y < platform.y &&
                this.y + this.height >= platform.y &&
                this.y + this.height <= platform.y + 20) {
                this.y = platform.y - this.height;
                this.velocityY = 0;
                this.isGrounded = true;
                this.isJumping = false;
                this.jumpReleased = false;
                this.wasInAir = false;
            }
        });


        if (this.x + this.width < 0) {
            this.x = canvas.width;
        }
        if (this.x > canvas.width) {
            this.x = -this.width;
        }
        
        // Add vertical looping for Platform Arena and Gunning modes
        if (gameMode === 'platformArena' || gameMode === 'gunning') {
            if (this.y + this.height < 0) {
                this.y = canvas.height;
                this.velocityY = Math.min(this.velocityY, 5); // Cap downward velocity when looping from top
            }
            if (this.y > canvas.height) {
                this.y = -this.height;
                this.velocityY = Math.max(this.velocityY, -5); // Cap upward velocity when looping from bottom
            }
        }

        if (this.attackCooldown > 0) this.attackCooldown--;
        if (this.attackTimer > 0) {
            this.attackTimer--;
            if (this.attackTimer === 0) {
                this.isAttacking = false;
            }
        }

        if (this.powerupDuration > 0) {
            this.powerupDuration--;
            if (this.powerupDuration === 0) {
                this.deactivatePowerup();
            }
        }

        if (this.powerupCooldown > 0) {
            this.powerupCooldown--;
        }
        
        if (this.gunCooldown > 0) {
            this.gunCooldown--;
        }
        
        // Handle automatic super bullet spawning
        if (gameMode === 'gunning' && this.superBulletsRemaining > 0) {
            this.superBulletTimer++;
            if (this.superBulletTimer >= 60) {  // 60 frames = 1 second at 60 FPS
                this.spawnSuperBullet();
                this.superBulletsRemaining--;
                this.superBulletTimer = 0;
                
                // Turn off super active effect after all bullets are spawned
                if (this.superBulletsRemaining === 0) {
                    this.superGunActive = false;
                }
            }
        }
        
        // Smoothly return stretch values to normal
        if (this.stretchY < 1) {
            this.stretchY += 0.08;
            if (this.stretchY > 1) this.stretchY = 1;
        } else if (this.stretchY > 1) {
            this.stretchY -= 0.08;
            if (this.stretchY < 1) this.stretchY = 1;
        }
        
        if (this.stretchX < 1) {
            this.stretchX += 0.08;
            if (this.stretchX > 1) this.stretchX = 1;
        } else if (this.stretchX > 1) {
            this.stretchX -= 0.08;
            if (this.stretchX < 1) this.stretchX = 1;
        }
    }

    attack() {
        this.isAttacking = true;
        this.attackCooldown = 30;
        this.attackTimer = this.attackDuration;
    }

    activatePowerup() {
        if (gameMode === 'gunning') {
            // In gunning, super spawns 5 bullets automatically over 5 seconds
            this.superGunActive = true;
            this.superBulletsRemaining = 5;
            this.superBulletTimer = 60;  // Start with first bullet immediately (will trigger on next frame)
            this.powerupActive = false;  // Don't show continuous powerup effect
            this.powerupCooldown = 600;  // Cooldown before next use
        } else {
            this.powerupActive = true;
            this.powerupDuration = 600; // 10 seconds at 60 FPS
            this.speed = this.baseSpeed * 1.3;
            this.attackDamage = this.baseAttackDamage * 1.5;
        }
    }

    deactivatePowerup() {
        if (gameMode === 'gunning') {
            this.superGunActive = false;
            this.powerupActive = false;
            const randomCooldown = Math.floor(Math.random() * (30 - 20 + 1)) + 20;
            this.powerupCooldown = randomCooldown * 60;
        } else {
            this.powerupActive = false;
            this.speed = this.baseSpeed;
            this.attackDamage = this.baseAttackDamage;
            const randomCooldown = Math.floor(Math.random() * (30 - 20 + 1)) + 20;
            this.powerupCooldown = randomCooldown * 60; // Convert seconds to frames
        }
    }

    getAttackBox() {
        if (!this.isAttacking) return null;
        return {
            x: this.facing === 1 ? this.x + this.width : this.x - 30,
            y: this.y + 10,
            width: 30,
            height: 40
        };
    }

    takeDamage(damage, knockbackX) {
        const actualDamage = damage * (2 - this.defense);
        this.health -= actualDamage;
        this.knockback = knockbackX;
        this.stunTimer = 15;
        if (this.health < 0) this.health = 0;
    }

    draw() {
        ctx.save();
        
        // Calculate animation offsets
        const drawWidth = this.width * this.stretchX;
        const drawHeight = this.height * this.stretchY;
        const offsetX = (this.width - drawWidth) / 2;
        const offsetY = (this.height - drawHeight);
        
        const drawX = this.x + offsetX;
        const drawY = this.y + offsetY;
        
        if (gameMode === 'gunning' && this.superGunActive) {
            // Special highlighting for gunning super mode
            ctx.shadowBlur = 20;
            ctx.shadowColor = this === player1 ? '#FF0000' : '#0000FF';
            ctx.fillStyle = this.color;
            ctx.fillRect(drawX, drawY, drawWidth, drawHeight);
            ctx.shadowBlur = 0;
            
            ctx.strokeStyle = this === player1 ? '#FF0000' : '#0000FF';
            ctx.lineWidth = 3;
            ctx.strokeRect(drawX - 2, drawY - 2, drawWidth + 4, drawHeight + 4);
        } else if (this.powerupActive) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#FFD700';
            ctx.fillStyle = this.color;
            ctx.fillRect(drawX, drawY, drawWidth, drawHeight);
            ctx.shadowBlur = 0;
            
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 3;
            ctx.strokeRect(drawX - 2, drawY - 2, drawWidth + 4, drawHeight + 4);
        } else {
            ctx.fillStyle = this.color;
            ctx.fillRect(drawX, drawY, drawWidth, drawHeight);
        }
        
        // Scale facial features with the body
        ctx.fillStyle = '#333';
        const eyeY = drawY + (15 * this.stretchY);
        const eyeWidth = 8 * this.stretchX;
        const eyeHeight = 8 * this.stretchY;
        
        if (this.facing === 1) {
            ctx.fillRect(drawX + (25 * this.stretchX), eyeY, eyeWidth, eyeHeight);
            ctx.fillRect(drawX + (35 * this.stretchX), eyeY, eyeWidth, eyeHeight);
        } else {
            ctx.fillRect(drawX + (7 * this.stretchX), eyeY, eyeWidth, eyeHeight);
            ctx.fillRect(drawX + (17 * this.stretchX), eyeY, eyeWidth, eyeHeight);
        }
        
        // Mouth
        ctx.fillStyle = '#333';
        const mouthY = drawY + (35 * this.stretchY);
        const mouthWidth = 20 * this.stretchX;
        const mouthHeight = 5 * this.stretchY;
        
        if (this.facing === 1) {
            ctx.fillRect(drawX + (22 * this.stretchX), mouthY, mouthWidth, mouthHeight);
        } else {
            ctx.fillRect(drawX + (8 * this.stretchX), mouthY, mouthWidth, mouthHeight);
        }
        
        ctx.restore();
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        if (this.facing === 1) {
            ctx.moveTo(this.x + this.width, this.y + this.height/2);
            ctx.lineTo(this.x + this.width + 10, this.y + this.height/2 - 5);
            ctx.lineTo(this.x + this.width + 10, this.y + this.height/2 + 5);
        } else {
            ctx.moveTo(this.x, this.y + this.height/2);
            ctx.lineTo(this.x - 10, this.y + this.height/2 - 5);
            ctx.lineTo(this.x - 10, this.y + this.height/2 + 5);
        }
        ctx.closePath();
        ctx.fill();
        
        if (this.isAttacking) {
            ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
            const attackBox = this.getAttackBox();
            ctx.fillRect(attackBox.x, attackBox.y, attackBox.width, attackBox.height);
        }
        
        // Show health bar for all modes
        const healthBarWidth = 60;
        const healthBarHeight = 8;
        const healthBarX = this.x + (this.width - healthBarWidth) / 2;
        const healthBarY = this.y - 20;
        
        {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(healthBarX, healthBarY, healthBarWidth, healthBarHeight);
            
            // Use gunningHealth for gunning mode, regular health otherwise
            const currentHealth = gameMode === 'gunning' ? this.gunningHealth : this.health;
            const maxHealth = gameMode === 'gunning' ? this.maxGunningHealth : this.maxHealth;
            const healthPercentage = currentHealth / maxHealth;
            const healthColor = healthPercentage > 0.5 ? '#4CAF50' : 
                              healthPercentage > 0.25 ? '#FFC107' : '#F44336';
            ctx.fillStyle = healthColor;
            ctx.fillRect(healthBarX, healthBarY, healthBarWidth * healthPercentage, healthBarHeight);
            
            // Show hit counter for gunning mode
            if (gameMode === 'gunning') {
                ctx.fillStyle = '#FFF';
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`${currentHealth}/${maxHealth}`, healthBarX + healthBarWidth/2, healthBarY - 2);
                
                // Show shield status
                if (this.shieldsCollected > 0) {
                    ctx.fillStyle = '#FFD700';
                    ctx.font = 'bold 10px Arial';
                    if (this.gunningHealth >= this.maxGunningHealth) {
                        // At max HP, show shield status
                        ctx.fillText(`Shield: ${this.shieldsCollected}/2`, healthBarX + healthBarWidth/2, healthBarY + healthBarHeight + 10);
                    }
                }
            }
        }
        
        if (this.powerupCooldown > 0) {
            const cooldownPercentage = this.powerupCooldown / (30 * 60);
            const cooldownBarY = healthBarY - 12;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(healthBarX, cooldownBarY, healthBarWidth, 4);
            
            ctx.fillStyle = '#9C27B0';
            ctx.fillRect(healthBarX, cooldownBarY, healthBarWidth * cooldownPercentage, 4);
        } else if (!this.powerupActive) {
            const readyBarY = healthBarY - 12;
            ctx.fillStyle = '#FFD700';
            ctx.fillRect(healthBarX, readyBarY, healthBarWidth, 4);
        }
        
        if (this.powerupActive) {
            const durationPercentage = this.powerupDuration / 600;
            const durationBarY = healthBarY - 12;
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(healthBarX, durationBarY, healthBarWidth, 4);
            
            ctx.fillStyle = '#FFD700';
            ctx.fillRect(healthBarX, durationBarY, healthBarWidth * durationPercentage, 4);
        }
    }
}

class Platform {
    constructor(x, y, width, height) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    draw() {
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.fillStyle = '#654321';
        ctx.fillRect(this.x, this.y + 5, this.width, 2);
    }
}

class Bullet {
    constructor(x, y, targetX, targetY, speed, owner, isSuper = false) {
        this.x = x;
        this.y = y;
        this.width = 10;
        this.height = 5;
        
        // Calculate initial angle toward target
        const dx = targetX - x;
        const dy = targetY - y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        this.velocityX = (dx / distance) * speed;
        this.velocityY = (dy / distance) * speed;
        this.speed = speed;
        this.owner = owner; // 'player1' or 'player2'
        this.distanceTraveled = 0;
        this.maxDistance = canvas.width * 2; // Two screen widths
        this.isSuper = isSuper;
        this.active = true;
        this.homingStrength = 0.05; // How strongly bullets home
    }
    
    update() {
        // Get target player for homing
        const target = this.owner === 'player1' ? player2 : player1;
        
        // Calculate homing vector
        const dx = (target.x + target.width/2) - this.x;
        const dy = (target.y + target.height/2) - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            // Apply homing force
            const homingX = (dx / distance) * this.speed * this.homingStrength;
            const homingY = (dy / distance) * this.speed * this.homingStrength;
            
            this.velocityX += homingX;
            this.velocityY += homingY;
            
            // Normalize velocity to maintain constant speed
            const currentSpeed = Math.sqrt(this.velocityX * this.velocityX + this.velocityY * this.velocityY);
            this.velocityX = (this.velocityX / currentSpeed) * this.speed;
            this.velocityY = (this.velocityY / currentSpeed) * this.speed;
        }
        
        this.x += this.velocityX;
        this.y += this.velocityY;
        
        // Super bullets last forever, normal bullets have distance limit
        if (!this.isSuper) {
            this.distanceTraveled += Math.abs(this.velocityX) + Math.abs(this.velocityY);
            if (this.distanceTraveled >= this.maxDistance) {
                this.active = false;
            }
        }
        
        // Horizontal wrapping
        if (this.x < -this.width) {
            this.x = canvas.width;
        }
        if (this.x > canvas.width) {
            this.x = -this.width;
        }
        
        // Vertical wrapping for gunning mode
        if (this.y < -this.height) {
            this.y = canvas.height;
        }
        if (this.y > canvas.height) {
            this.y = -this.height;
        }
    }
    
    draw() {
        ctx.save();
        
        // Player 1 bullets (red) always have black outline
        if (this.owner === 'player1') {
            // Draw black outline for red bullets
            ctx.fillStyle = '#000000';
            ctx.fillRect(this.x - 1, this.y - 1, this.width + 2, this.height + 2);
            // Draw red bullet inside
            ctx.fillStyle = '#FF6B6B';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        } else {
            // Player 2 bullets are just black
            ctx.fillStyle = '#000000';
            ctx.fillRect(this.x, this.y, this.width, this.height);
        }
        
        ctx.restore();
    }
    
    checkCollision(player) {
        return this.x < player.x + player.width &&
               this.x + this.width > player.x &&
               this.y < player.y + player.height &&
               this.y + this.height > player.y;
    }
}

class Lootbox {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 30;
        this.collected = false;
        this.bobOffset = 0;
        this.bobSpeed = 0.1;
    }

    update() {
        this.bobOffset += this.bobSpeed;
        this.y += Math.sin(this.bobOffset) * 0.5;
    }

    checkCollection(player) {
        if (!this.collected &&
            player.x < this.x + this.width &&
            player.x + player.width > this.x &&
            player.y < this.y + this.height &&
            player.y + player.height > this.y) {
            
            if (gameMode === 'gunning') {
                // In Gunning mode, shields work differently
                if (player.gunningHealth < player.maxGunningHealth) {
                    // Below max health: 1 shield = heal 1 HP immediately
                    player.gunningHealth = Math.min(player.gunningHealth + 1, player.maxGunningHealth);
                } else {
                    // At max health: collect shields for permanent HP increase
                    player.shieldsCollected++;
                    if (player.shieldsCollected >= 2) {
                        // 2 shields at max HP = increase max health permanently
                        player.maxGunningHealth++;
                        player.gunningHealth = player.maxGunningHealth;
                        player.shieldsCollected = 0;  // Reset counter
                    }
                    // 1 shield at max HP is stored and will absorb next damage
                }
            } else {
                // Normal modes - shields add defense
                if (player.defense < 1.4) {
                    player.defense = Math.min(player.defense + 0.1, 1.4);
                }
            }
            this.collected = true;
            return true;
        }
        return false;
    }

    draw() {
        if (this.collected) return;

        ctx.shadowBlur = 10;
        ctx.shadowColor = '#C0C0C0';
        
        // Main chestplate body
        const gradient = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.height);
        gradient.addColorStop(0, '#E0E0E0');
        gradient.addColorStop(0.3, '#C0C0C0');
        gradient.addColorStop(0.7, '#A0A0A0');
        gradient.addColorStop(1, '#808080');
        ctx.fillStyle = gradient;
        
        // Draw chestplate shape
        ctx.beginPath();
        ctx.moveTo(this.x + 5, this.y + 5);
        ctx.lineTo(this.x + 25, this.y + 5);
        ctx.lineTo(this.x + 28, this.y + 10);
        ctx.lineTo(this.x + 28, this.y + 20);
        ctx.lineTo(this.x + 25, this.y + 28);
        ctx.lineTo(this.x + 5, this.y + 28);
        ctx.lineTo(this.x + 2, this.y + 20);
        ctx.lineTo(this.x + 2, this.y + 10);
        ctx.closePath();
        ctx.fill();
        
        ctx.shadowBlur = 0;
        
        // Metal shine effect
        ctx.strokeStyle = '#F0F0F0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.x + 8, this.y + 8);
        ctx.lineTo(this.x + 12, this.y + 8);
        ctx.stroke();
        
        // Center rivets/details
        ctx.fillStyle = '#606060';
        ctx.fillRect(this.x + 13, this.y + 12, 4, 4);
        ctx.fillRect(this.x + 13, this.y + 20, 4, 4);
        
        // Outline
        ctx.strokeStyle = '#404040';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x + 5, this.y + 5);
        ctx.lineTo(this.x + 25, this.y + 5);
        ctx.lineTo(this.x + 28, this.y + 10);
        ctx.lineTo(this.x + 28, this.y + 20);
        ctx.lineTo(this.x + 25, this.y + 28);
        ctx.lineTo(this.x + 5, this.y + 28);
        ctx.lineTo(this.x + 2, this.y + 20);
        ctx.lineTo(this.x + 2, this.y + 10);
        ctx.closePath();
        ctx.stroke();
    }
}

const keys = {};

let lastKeyPress = {};

// Hidden test mode variables
let testModeActive = false;
let testKeySequence = '';
let testP1Input = '';
let testP2Input = '';
let testP1Input2 = ''; // Attack (normal) or Cooldown (gunning)
let testP2Input2 = ''; // Attack (normal) or Cooldown (gunning)
let maxFallSpeed = 100; // Default max fall speed
let fallSliderDragging = false; // Is the fall speed slider being dragged
let gameSpeed = 60; // Game speed in FPS (default 60)
let speedSliderDragging = false; // Is the game speed slider being dragged
let gravitySliderDragging = false; // Is the gravity slider being dragged
let initialFallSpeed = 0; // Starting speed when falling (default 0)
let initialFallSliderDragging = false; // Is the initial fall speed slider being dragged
let testActiveInput = null; // 'p1', 'p2', 'p1b', 'p2b' or null

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    // Hidden test mode sequence detection (tst)
    if (!testModeActive) {
        if (key === 't' || key === 's') {
            testKeySequence += key;
            if (testKeySequence.length > 3) {
                testKeySequence = testKeySequence.slice(-3);
            }
            if (testKeySequence === 'tst') {
                testModeActive = true;
                testKeySequence = '';
                testActiveInput = null;
                e.preventDefault();
                return;
            }
        } else if (key !== 'shift') {
            testKeySequence = '';
        }
    }

    // Handle test mode input
    if (testModeActive) {
        if (key === 'escape') {
            applyTestValues();
            testModeActive = false;
            testActiveInput = null;
            e.preventDefault();
            return;
        }

        // Tab to switch between inputs
        if (key === 'tab') {
            if (testActiveInput === 'p1') {
                testActiveInput = 'p2';
            } else if (testActiveInput === 'p2') {
                testActiveInput = 'p1';
            } else {
                testActiveInput = 'p1';
            }
            e.preventDefault();
            return;
        }

        // Click-like selection with 1, 2, 3, 4 keys when no input active
        if (testActiveInput === null) {
            if (key === '1') {
                testActiveInput = 'p1';
                e.preventDefault();
                return;
            } else if (key === '2') {
                testActiveInput = 'p2';
                e.preventDefault();
                return;
            } else if (key === '3') {
                testActiveInput = 'p1b';
                e.preventDefault();
                return;
            } else if (key === '4') {
                testActiveInput = 'p2b';
                e.preventDefault();
                return;
            }
        }

        // Number input for active field
        if (testActiveInput) {
            if (key >= '0' && key <= '9') {
                const maxLength = gameMode === 'gunning' ? 5 : 3;
                if (testActiveInput === 'p1') {
                    if (testP1Input.length < maxLength) testP1Input += key;
                } else if (testActiveInput === 'p2') {
                    if (testP2Input.length < maxLength) testP2Input += key;
                } else if (testActiveInput === 'p1b') {
                    if (testP1Input2.length < maxLength) testP1Input2 += key;
                } else if (testActiveInput === 'p2b') {
                    if (testP2Input2.length < maxLength) testP2Input2 += key;
                }
                e.preventDefault();
                return;
            }

            if (key === 'backspace') {
                if (testActiveInput === 'p1') {
                    testP1Input = testP1Input.slice(0, -1);
                } else if (testActiveInput === 'p2') {
                    testP2Input = testP2Input.slice(0, -1);
                } else if (testActiveInput === 'p1b') {
                    testP1Input2 = testP1Input2.slice(0, -1);
                } else if (testActiveInput === 'p2b') {
                    testP2Input2 = testP2Input2.slice(0, -1);
                }
                e.preventDefault();
                return;
            }

            // Enter, Shift, or Escape to apply the value and exit text box
            if (key === 'enter' || key === 'shift') {
                applyTestValues();
                testActiveInput = null;
                e.preventDefault();
                return;
            }
        }

        e.preventDefault();
        return;
    }

    // Check for first input to start shield spawning (only in playing state)
    if (gameState === 'playing' && !gameStarted) {
        const validStartKeys = ['q', 'e', 'r', 'g', 'f', 'w', 'a', 's', 'd',
                               'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
                               'shift', 'enter', 'alt', '/', "'"];
        if (validStartKeys.includes(key)) {
            gameStarted = true;
        }
    }

    // M key always returns to menu from any state
    if (key === 'm' && gameState !== 'menu') {
        returnToMenu();
        keys[key] = true;
        e.preventDefault();
        return;
    }
    
    // Toggle controls - only trigger on first press, not hold
    if (!keys[key]) {
        // Player 1 toggles - R key only toggles autofire during actual gameplay, not in menus or game over screens
        if (key === 'r' && gameState === 'playing') {
            player1.autoFire = !player1.autoFire;
        } else if (key === 'e' && gameState === 'playing') {
            player1.autoJump = !player1.autoJump;
            if (player1.autoJump) player1.jumpDisabled = false; // Disable no-jump when enabling auto-jump
        } else if (key === 'q' && gameState === 'playing') {
            player1.jumpDisabled = !player1.jumpDisabled;
            if (player1.jumpDisabled) player1.autoJump = false; // Disable auto-jump when enabling no-jump
        }
        
        // Player 2 toggles
        if ((key === '/' || key === '?') && gameState === 'playing') {
            player2.autoFire = !player2.autoFire;
        } else if ((key === "'" || key === '"') && gameState === 'playing') {
            player2.autoJump = !player2.autoJump;
            if (player2.autoJump) player2.jumpDisabled = false; // Disable no-jump when enabling auto-jump
        } else if (key === '.' && gameState === 'playing') {
            player2.jumpDisabled = !player2.jumpDisabled;
            if (player2.jumpDisabled) player2.autoJump = false; // Disable auto-jump when enabling no-jump
        }
    }
    
    keys[key] = true;
    e.preventDefault();
});

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
    e.preventDefault();
});

// Mouse events for menu
let mouseX = 0;
let mouseY = 0;

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;

    if (gameState === 'menu') {
        Object.keys(menuButtons).forEach(key => {
            const button = menuButtons[key];
            button.hovered = mouseX >= button.x && mouseX <= button.x + button.width &&
                           mouseY >= button.y && mouseY <= button.y + button.height;
        });
    }

    // Handle fall speed slider dragging
    if (testModeActive && fallSliderDragging && window.fallSliderBounds) {
        const bounds = window.fallSliderBounds;
        let newValue = Math.round(((mouseX - bounds.x) / bounds.width) * 249 + 1);
        newValue = Math.max(1, Math.min(250, newValue));
        maxFallSpeed = newValue;
    }

    // Handle game speed slider dragging
    if (testModeActive && speedSliderDragging && window.speedSliderBounds) {
        const bounds = window.speedSliderBounds;
        let newValue = Math.round(((mouseX - bounds.x) / bounds.width) * 179 + 1);
        newValue = Math.max(1, Math.min(180, newValue));
        gameSpeed = newValue;
    }

    // Handle gravity slider dragging
    if (testModeActive && gravitySliderDragging && window.gravitySliderBounds) {
        const bounds = window.gravitySliderBounds;
        let newValue = ((mouseX - bounds.x) / bounds.width) * 2.9 + 0.1;
        newValue = Math.max(0.1, Math.min(3.0, newValue));
        gravity = Math.round(newValue * 10) / 10; // Round to 1 decimal
    }

    // Handle initial fall speed slider dragging
    if (testModeActive && initialFallSliderDragging && window.initialFallSliderBounds) {
        const bounds = window.initialFallSliderBounds;
        let newValue = Math.round((mouseX - bounds.x) / bounds.width * 50);
        newValue = Math.max(0, Math.min(50, newValue));
        initialFallSpeed = newValue;
    }
});

canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Check if clicking on fall speed slider
    if (testModeActive && window.fallSliderBounds) {
        const bounds = window.fallSliderBounds;
        if (mx >= bounds.x && mx <= bounds.x + bounds.width &&
            my >= bounds.y && my <= bounds.y + bounds.height) {
            fallSliderDragging = true;
            let newValue = Math.round(((mx - bounds.x) / bounds.width) * 249 + 1);
            newValue = Math.max(1, Math.min(250, newValue));
            maxFallSpeed = newValue;
        }
    }

    // Check if clicking on game speed slider
    if (testModeActive && window.speedSliderBounds) {
        const bounds = window.speedSliderBounds;
        if (mx >= bounds.x && mx <= bounds.x + bounds.width &&
            my >= bounds.y && my <= bounds.y + bounds.height) {
            speedSliderDragging = true;
            let newValue = Math.round(((mx - bounds.x) / bounds.width) * 179 + 1);
            newValue = Math.max(1, Math.min(180, newValue));
            gameSpeed = newValue;
        }
    }

    // Check if clicking on gravity slider
    if (testModeActive && window.gravitySliderBounds) {
        const bounds = window.gravitySliderBounds;
        if (mx >= bounds.x && mx <= bounds.x + bounds.width &&
            my >= bounds.y && my <= bounds.y + bounds.height) {
            gravitySliderDragging = true;
            let newValue = ((mx - bounds.x) / bounds.width) * 2.9 + 0.1;
            newValue = Math.max(0.1, Math.min(3.0, newValue));
            gravity = Math.round(newValue * 10) / 10;
        }
    }

    // Check if clicking on initial fall speed slider
    if (testModeActive && window.initialFallSliderBounds) {
        const bounds = window.initialFallSliderBounds;
        if (mx >= bounds.x && mx <= bounds.x + bounds.width &&
            my >= bounds.y && my <= bounds.y + bounds.height) {
            initialFallSliderDragging = true;
            let newValue = Math.round((mx - bounds.x) / bounds.width * 50);
            newValue = Math.max(0, Math.min(50, newValue));
            initialFallSpeed = newValue;
        }
    }
});

canvas.addEventListener('mouseup', (e) => {
    fallSliderDragging = false;
    speedSliderDragging = false;
    gravitySliderDragging = false;
    initialFallSliderDragging = false;
});

canvas.addEventListener('click', (e) => {
    if (gameState === 'menu') {
        Object.keys(menuButtons).forEach(key => {
            const button = menuButtons[key];
            if (button.hovered) {
                if (key === 'healthModeButton') {
                    // Cycle through health modes and update button text
                    if (healthMode === 'normal') {
                        healthMode = 'long';
                        menuButtons.healthModeButton.text = 'Long Mode';
                    } else if (healthMode === 'long') {
                        healthMode = 'short';
                        menuButtons.healthModeButton.text = 'Short Mode';
                    } else if (healthMode === 'short') {
                        healthMode = 'normal';
                        menuButtons.healthModeButton.text = 'Normal Mode';
                    }
                } else if (key === 'bestOf3') {
                    gameMode = 'bestOf3';
                    gameState = 'playing';
                    resetMatch();
                } else if (key === 'classic') {
                    gameMode = 'classic';
                    gameState = 'playing';
                    resetRound();
                } else if (key === 'platformArena') {
                    gameMode = 'platformArena';
                    gameState = 'playing';
                    setupPlatformArena();
                    resetRound();
                } else if (key === 'gunning') {
                    gameMode = 'gunning';
                    gameState = 'playing';
                    setupGunningMode();
                    resetRound();
                }
            }
        });
    }
});

const player1 = new Player(200, 200, '#FF6B6B', {
    left: 'a',
    right: 'd',
    jump: 'w',
    down: 's',
    attack: 'f',
    powerup: 'g'
});

const player2 = new Player(700, 200, '#4ECDC4', {
    left: 'arrowleft',
    right: 'arrowright',
    jump: 'arrowup',
    down: 'arrowdown',
    attack: 'enter',
    powerup: '\\'
});

let platforms = [
    new Platform(150, 450, 200, 20),
    new Platform(650, 450, 200, 20),
    new Platform(400, 350, 200, 20),
    new Platform(250, 250, 150, 20),
    new Platform(600, 250, 150, 20)
];

const defaultPlatforms = [
    new Platform(150, 450, 200, 20),
    new Platform(650, 450, 200, 20),
    new Platform(400, 350, 200, 20),
    new Platform(250, 250, 150, 20),
    new Platform(600, 250, 150, 20)
];

let gameState = 'menu';
let gameMode = null; // 'bestOf3' or 'classic'
let winner = null;
let healthMode = 'normal'; // 'long' (15x), 'normal' (1x), or 'short' (1/100x)
let lootboxes = [];
let lootboxTimer = 0;
const LOOTBOX_SPAWN_TIME_NORMAL = 420; // 7 seconds at 60 FPS for normal modes
const LOOTBOX_SPAWN_TIME_GUNNING = 180; // 3 seconds at 60 FPS for gunning mode
let bullets = [];
let gameStarted = false; // Track if first input has been received

// Round system
let player1Wins = 0;
let player2Wins = 0;
const WINS_NEEDED = 3;
let roundWinner = null;
let matchWinner = null;
let lastDeathFrame = -999;
let currentFrame = 0;
const TIE_FRAME_WINDOW = 3;

// Menu button properties
const menuButtons = {
    bestOf3: {
        x: 100,
        y: 250,
        width: 180,
        height: 60,
        text: 'Best of 3',
        hovered: false
    },
    classic: {
        x: 290,
        y: 250,
        width: 180,
        height: 60,
        text: 'Classic',
        hovered: false
    },
    platformArena: {
        x: 480,
        y: 250,
        width: 180,
        height: 60,
        text: 'Platform Arena',
        hovered: false
    },
    gunning: {
        x: 670,
        y: 250,
        width: 180,
        height: 60,
        text: 'Gunning',
        hovered: false
    },
    healthModeButton: {
        x: 385,
        y: 350,
        width: 230,
        height: 60,
        text: 'Normal Mode',  // Will show current mode
        hovered: false
    }
};

function checkCollisions() {
    const p1Attack = player1.getAttackBox();
    if (p1Attack) {
        if (player2.x < p1Attack.x + p1Attack.width &&
            player2.x + player2.width > p1Attack.x &&
            player2.y < p1Attack.y + p1Attack.height &&
            player2.y + player2.height > p1Attack.y) {
            player2.takeDamage(player1.attackDamage, player1.facing * 15);
        }
    }

    const p2Attack = player2.getAttackBox();
    if (p2Attack) {
        if (player1.x < p2Attack.x + p2Attack.width &&
            player1.x + player1.width > p2Attack.x &&
            player1.y < p2Attack.y + p2Attack.height &&
            player1.y + player1.height > p2Attack.y) {
            player1.takeDamage(player2.attackDamage, player2.facing * 15);
        }
    }
}

function checkWinner() {
    let player1Dead = player1.health <= 0;
    let player2Dead = player2.health <= 0;
    
    if (player1Dead || player2Dead) {
        if (gameMode === 'classic' || gameMode === 'platformArena') {
            // Classic and Platform Arena modes - single round
            if (player1Dead && player2Dead) {
                if (Math.abs(currentFrame - lastDeathFrame) <= TIE_FRAME_WINDOW) {
                    gameState = 'gameOver';
                    winner = 'Tie';
                } else if (player1Dead) {
                    gameState = 'gameOver';
                    winner = 'Player 2';
                } else {
                    gameState = 'gameOver';
                    winner = 'Player 1';
                }
            } else if (player1Dead) {
                if (Math.abs(currentFrame - lastDeathFrame) <= TIE_FRAME_WINDOW) {
                    gameState = 'gameOver';
                    winner = 'Tie';
                } else {
                    gameState = 'gameOver';
                    winner = 'Player 2';
                }
            } else if (player2Dead) {
                if (Math.abs(currentFrame - lastDeathFrame) <= TIE_FRAME_WINDOW) {
                    gameState = 'gameOver';
                    winner = 'Tie';
                } else {
                    gameState = 'gameOver';
                    winner = 'Player 1';
                }
            }
            lastDeathFrame = currentFrame;
        } else if (gameMode === 'bestOf3') {
            // Best of 3 mode
            if (player1Dead && player2Dead) {
                if (Math.abs(currentFrame - lastDeathFrame) <= TIE_FRAME_WINDOW) {
                    gameState = 'roundOver';
                    roundWinner = 'Tie';
                } else if (player1Dead) {
                    gameState = 'roundOver';
                    roundWinner = 'Player 2';
                    player2Wins++;
                } else {
                    gameState = 'roundOver';
                    roundWinner = 'Player 1';
                    player1Wins++;
                }
                lastDeathFrame = currentFrame;
            } else if (player1Dead) {
                if (Math.abs(currentFrame - lastDeathFrame) <= TIE_FRAME_WINDOW) {
                    gameState = 'roundOver';
                    roundWinner = 'Tie';
                } else {
                    gameState = 'roundOver';
                    roundWinner = 'Player 2';
                    player2Wins++;
                }
                lastDeathFrame = currentFrame;
            } else if (player2Dead) {
                if (Math.abs(currentFrame - lastDeathFrame) <= TIE_FRAME_WINDOW) {
                    gameState = 'roundOver';
                    roundWinner = 'Tie';
                } else {
                    gameState = 'roundOver';
                    roundWinner = 'Player 1';
                    player1Wins++;
                }
                lastDeathFrame = currentFrame;
            }
            
            // Check for match winner
            if (player1Wins >= WINS_NEEDED) {
                gameState = 'matchOver';
                matchWinner = 'Player 1';
            } else if (player2Wins >= WINS_NEEDED) {
                gameState = 'matchOver';
                matchWinner = 'Player 2';
            }
        }
    }
}

function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(1, '#98D8C8');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#90EE90';
    ctx.fillRect(0, groundLevel, canvas.width, canvas.height - groundLevel);
    
    ctx.fillStyle = '#7CCC7C';
    for (let i = 0; i < canvas.width; i += 40) {
        ctx.fillRect(i, groundLevel, 2, 10);
    }
}

function drawRoundOver() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 50px Arial';
    ctx.textAlign = 'center';
    
    if (roundWinner === 'Tie') {
        ctx.fillText('TIE ROUND!', canvas.width / 2, canvas.height / 2 - 100);
    } else {
        ctx.fillText(`${roundWinner} Wins Round!`, canvas.width / 2, canvas.height / 2 - 100);
    }
    
    // Draw score
    ctx.font = 'bold 40px Arial';
    ctx.fillStyle = '#FF6B6B';
    ctx.fillText(`P1: ${player1Wins}`, canvas.width / 2 - 150, canvas.height / 2);
    ctx.fillStyle = '#4ECDC4';
    ctx.fillText(`P2: ${player2Wins}`, canvas.width / 2 + 150, canvas.height / 2);
    
    ctx.fillStyle = 'white';
    ctx.font = '25px Arial';
    ctx.fillText(`First to ${WINS_NEEDED} wins`, canvas.width / 2, canvas.height / 2 + 50);
    
    ctx.font = '30px Arial';
    ctx.fillText('Press SPACE for next round', canvas.width / 2, canvas.height / 2 + 100);
    ctx.font = '20px Arial';
    ctx.fillText('R - Restart Match | M - Menu', canvas.width / 2, canvas.height / 2 + 140);
    
    if (keys[' ']) {
        resetRound();
    } else if (keys['r']) {
        resetMatch();
    } else if (keys['m']) {
        returnToMenu();
    }
}

function drawGameOver() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = 'white';
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    
    if (winner === 'Tie') {
        ctx.fillText('TIE GAME!', canvas.width / 2, canvas.height / 2 - 50);
    } else {
        ctx.fillText(`${winner} Wins!`, canvas.width / 2, canvas.height / 2 - 50);
    }
    
    ctx.font = '30px Arial';
    ctx.fillText('Press R to restart', canvas.width / 2, canvas.height / 2 + 20);
    ctx.fillText('Press M to return to menu', canvas.width / 2, canvas.height / 2 + 60);
    
    if (keys['r']) {
        resetRound();
    } else if (keys['m']) {
        returnToMenu();
    }
}

function drawMatchOver() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 70px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${matchWinner} WINS THE MATCH!`, canvas.width / 2, canvas.height / 2 - 100);
    
    // Final score
    ctx.font = 'bold 50px Arial';
    ctx.fillStyle = '#FF6B6B';
    ctx.fillText(`P1: ${player1Wins}`, canvas.width / 2 - 150, canvas.height / 2);
    ctx.fillStyle = '#4ECDC4';
    ctx.fillText(`P2: ${player2Wins}`, canvas.width / 2 + 150, canvas.height / 2);
    
    ctx.fillStyle = 'white';
    ctx.font = '30px Arial';
    ctx.fillText('Press R to restart match', canvas.width / 2, canvas.height / 2 + 100);
    ctx.fillText('Press M to return to menu', canvas.width / 2, canvas.height / 2 + 140);
    
    if (keys['r']) {
        resetMatch();
    } else if (keys['m']) {
        returnToMenu();
    }
}

function resetRound() {
    player1.x = 200;
    player1.y = 200;
    // Set health based on mode
    let baseHealth = 100;
    if (healthMode === 'long') {
        baseHealth = 1500;  // 15x health
    } else if (healthMode === 'short') {
        baseHealth = 1;  // 1 HP
    }
    player1.health = baseHealth;
    player1.maxHealth = baseHealth;
    player1.velocityX = 0;
    player1.velocityY = 0;
    player1.knockback = 0;
    player1.stunTimer = 0;
    player1.powerupActive = false;
    player1.powerupDuration = 0;
    player1.powerupCooldown = 0;
    player1.speed = player1.baseSpeed;
    player1.attackDamage = player1.baseAttackDamage;
    player1.defense = 1.0;
    player1.stretchX = 1;
    player1.stretchY = 1;
    
    player2.x = 700;
    player2.y = 200;
    player2.health = baseHealth;
    player2.maxHealth = baseHealth;
    player2.velocityX = 0;
    player2.velocityY = 0;
    player2.knockback = 0;
    player2.stunTimer = 0;
    player2.powerupActive = false;
    player2.powerupDuration = 0;
    player2.powerupCooldown = 0;
    player2.speed = player2.baseSpeed;
    player2.attackDamage = player2.baseAttackDamage;
    player2.defense = 1.0;
    player2.stretchX = 1;
    player2.stretchY = 1;
    
    lootboxes = [];
    lootboxTimer = 0;
    lastDeathFrame = -999;
    gameStarted = false;  // Reset first input tracker
    
    // If not in Platform Arena mode, reset to default platforms
    if (gameMode !== 'platformArena' && gameMode !== 'gunning') {
        platforms = defaultPlatforms.map(p => new Platform(p.x, p.y, p.width, p.height));
    }
    
    // Reset gunning mode specific properties
    if (gameMode === 'gunning') {
        let baseGunningHealth = 15;
        if (healthMode === 'long') {
            baseGunningHealth = 225;  // 15x health
        } else if (healthMode === 'short') {
            baseGunningHealth = 1;  // 1 hit
        }
        player1.maxGunningHealth = baseGunningHealth;
        player2.maxGunningHealth = baseGunningHealth;
        player1.gunningHealth = baseGunningHealth;
        player2.gunningHealth = baseGunningHealth;
        player1.gunCooldown = 0;
        player2.gunCooldown = 0;
        player1.baseCooldown = 40;
        player2.baseCooldown = 40;
        player1.superGunActive = false;
        player2.superGunActive = false;
        player1.shieldsCollected = 0;
        player2.shieldsCollected = 0;
        player1.superBulletsRemaining = 0;
        player2.superBulletsRemaining = 0;
        player1.superBulletTimer = 0;
        player2.superBulletTimer = 0;
        bullets = [];
    }
    
    roundWinner = null;
    winner = null;  // Reset winner to prevent "object object wins" bug
    
    gameState = 'playing';
}

function resetMatch() {
    player1Wins = 0;
    player2Wins = 0;
    matchWinner = null;
    currentFrame = 0;
    resetRound();
}

function returnToMenu() {
    gameState = 'menu';
    gameMode = null;
    player1Wins = 0;
    player2Wins = 0;
    matchWinner = null;
    winner = null;
    roundWinner = null;
    currentFrame = 0;

    // Clear all auto and no-jump settings
    player1.autoFire = false;
    player1.autoJump = false;
    player1.jumpDisabled = false;
    player2.autoFire = false;
    player2.autoJump = false;
    player2.jumpDisabled = false;

    gameStarted = false;  // Reset first input tracker

    // Reset hidden test mode
    testModeActive = false;
    testKeySequence = '';
    testP1Input = '';
    testP2Input = '';
    testP1Input2 = '';
    testP2Input2 = '';
    maxFallSpeed = 100;
    fallSliderDragging = false;
    gameSpeed = 60;
    speedSliderDragging = false;
    gravity = 0.7;
    gravitySliderDragging = false;
    initialFallSpeed = 0;
    initialFallSliderDragging = false;
    testActiveInput = null;

    // Reset platforms to default
    platforms = defaultPlatforms.map(p => new Platform(p.x, p.y, p.width, p.height));
}

function setupPlatformArena() {
    platforms = [];
    const platformWidth = 100;  // Smaller platforms
    const platformHeight = 15;  // Slightly thinner
    const horizontalSpacing = 120;  // Closer horizontal spacing
    const verticalSpacing = 80;  // Closer vertical spacing
    
    // Calculate number of platforms needed with extra coverage
    const cols = Math.ceil(canvas.width / horizontalSpacing) + 2;
    const rows = Math.ceil(canvas.height / verticalSpacing) + 2;
    
    // Generate platforms in a grid pattern filling the entire screen
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            // Stagger every other row for better coverage
            const x = (col * horizontalSpacing) - (row % 2) * (horizontalSpacing / 2);
            const y = row * verticalSpacing - 40; // Start slightly above screen
            
            // Add platform even if it starts off-screen to ensure no gaps
            if (x > -platformWidth && x < canvas.width + platformWidth) {
                platforms.push(new Platform(x, y, platformWidth, platformHeight));
            }
            
            // Add an extra platform to fill any remaining gaps on the right edge
            if (x < 0) {
                platforms.push(new Platform(x + canvas.width + horizontalSpacing, y, platformWidth, platformHeight));
            }
        }
    }
}

// Hidden test mode functions
function applyTestValues() {
    // Only apply for the currently active input
    if (!testActiveInput) return;

    // Determine which input and player
    const isSecondRow = testActiveInput === 'p1b' || testActiveInput === 'p2b';
    const isP1 = testActiveInput === 'p1' || testActiveInput === 'p1b';
    const player = isP1 ? player1 : player2;

    if (isSecondRow) {
        // Second row: Attack modifier (normal) or Cooldown modifier (gunning)
        const input = isP1 ? testP1Input2 : testP2Input2;
        if (input === '') return;

        if (gameMode === 'gunning') {
            // Cooldown modifier (1-100, lower = faster shooting)
            let value = parseInt(input) || 40;
            value = Math.max(1, Math.min(100, value));
            player.gunCooldown = 0; // Reset current cooldown
            player.baseCooldown = value; // Store custom cooldown
        } else if (gameMode === 'classic' || gameMode === 'bestOf3' || gameMode === 'platformArena') {
            // Attack damage multiplier (1-100)
            let multiplier = parseFloat(input) || 1;
            multiplier = Math.max(0.1, Math.min(100, multiplier));
            player.attackDamage = Math.round(player.baseAttackDamage * multiplier);
        }
    } else {
        // First row: Health
        const input = isP1 ? testP1Input : testP2Input;
        if (input === '') return;

        if (gameMode === 'gunning') {
            // In gunning mode: direct health value (1-10000)
            let value = parseInt(input) || 1;
            value = Math.max(1, Math.min(10000, value));
            player.maxGunningHealth = value;
            player.gunningHealth = value;
        } else if (gameMode === 'classic' || gameMode === 'bestOf3' || gameMode === 'platformArena') {
            // In other modes: health multiplier (1-100)
            let multiplier = parseFloat(input) || 1;
            multiplier = Math.max(0.1, Math.min(100, multiplier));
            const baseHealth = healthMode === 'long' ? 1500 : (healthMode === 'short' ? 1 : 100);
            const newHealth = Math.round(baseHealth * multiplier);
            player.maxHealth = newHealth;
            player.health = newHealth;
        }
    }
}

function drawTestPanel() {
    if (!testModeActive) return;

    const isGunning = gameMode === 'gunning';
    const label1 = isGunning ? 'Health (1-10000)' : 'HP Multiplier (1-100)';
    const label2 = isGunning ? 'Cooldown (1-100)' : 'ATK Multiplier (1-100)';

    // Player 1 (Red) - Top Left
    ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.fillRect(10, 40, 150, 115);
    ctx.strokeStyle = (testActiveInput === 'p1' || testActiveInput === 'p1b') ? '#FFD700' : '#FFF';
    ctx.lineWidth = (testActiveInput === 'p1' || testActiveInput === 'p1b') ? 3 : 1;
    ctx.strokeRect(10, 40, 150, 115);

    ctx.fillStyle = '#FFF';
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('P1 ' + label1, 15, 53);

    // Input box for P1 health
    ctx.fillStyle = testActiveInput === 'p1' ? '#333' : '#222';
    ctx.fillRect(15, 56, 100, 22);
    ctx.strokeStyle = testActiveInput === 'p1' ? '#FFD700' : '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(15, 56, 100, 22);
    ctx.fillStyle = '#FFF';
    ctx.font = '14px Arial';
    ctx.fillText(testP1Input || '1', 20, 72);
    ctx.fillStyle = '#AAA';
    ctx.font = '10px Arial';
    ctx.fillText('[1]', 120, 72);

    // P1 second row label
    ctx.fillStyle = '#FFF';
    ctx.font = '11px Arial';
    ctx.fillText('P1 ' + label2, 15, 95);

    // Input box for P1 attack/cooldown
    ctx.fillStyle = testActiveInput === 'p1b' ? '#333' : '#222';
    ctx.fillRect(15, 98, 100, 22);
    ctx.strokeStyle = testActiveInput === 'p1b' ? '#FFD700' : '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(15, 98, 100, 22);
    ctx.fillStyle = '#FFF';
    ctx.font = '14px Arial';
    ctx.fillText(testP1Input2 || '1', 20, 114);
    ctx.fillStyle = '#AAA';
    ctx.font = '10px Arial';
    ctx.fillText('[3]', 120, 114);

    ctx.fillStyle = '#888';
    ctx.font = '9px Arial';
    ctx.fillText('Shift to apply', 15, 145);

    // Player 2 (Blue) - Top Right
    const p2X = canvas.width - 160;
    ctx.fillStyle = 'rgba(0, 100, 200, 0.8)';
    ctx.fillRect(p2X, 40, 150, 115);
    ctx.strokeStyle = (testActiveInput === 'p2' || testActiveInput === 'p2b') ? '#FFD700' : '#FFF';
    ctx.lineWidth = (testActiveInput === 'p2' || testActiveInput === 'p2b') ? 3 : 1;
    ctx.strokeRect(p2X, 40, 150, 115);

    ctx.fillStyle = '#FFF';
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('P2 ' + label1, p2X + 5, 53);

    // Input box for P2 health
    ctx.fillStyle = testActiveInput === 'p2' ? '#333' : '#222';
    ctx.fillRect(p2X + 5, 56, 100, 22);
    ctx.strokeStyle = testActiveInput === 'p2' ? '#FFD700' : '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(p2X + 5, 56, 100, 22);
    ctx.fillStyle = '#FFF';
    ctx.font = '14px Arial';
    ctx.fillText(testP2Input || '1', p2X + 10, 72);
    ctx.fillStyle = '#AAA';
    ctx.font = '10px Arial';
    ctx.fillText('[2]', p2X + 110, 72);

    // P2 second row label
    ctx.fillStyle = '#FFF';
    ctx.font = '11px Arial';
    ctx.fillText('P2 ' + label2, p2X + 5, 95);

    // Input box for P2 attack/cooldown
    ctx.fillStyle = testActiveInput === 'p2b' ? '#333' : '#222';
    ctx.fillRect(p2X + 5, 98, 100, 22);
    ctx.strokeStyle = testActiveInput === 'p2b' ? '#FFD700' : '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(p2X + 5, 98, 100, 22);
    ctx.fillStyle = '#FFF';
    ctx.font = '14px Arial';
    ctx.fillText(testP2Input2 || '1', p2X + 10, 114);
    ctx.fillStyle = '#AAA';
    ctx.font = '10px Arial';
    ctx.fillText('[4]', p2X + 110, 114);

    ctx.fillStyle = '#888';
    ctx.font = '9px Arial';
    ctx.fillText('Shift to apply', p2X + 5, 145);

    // Fall Speed Slider - Bottom center
    const sliderX = canvas.width / 2 - 75;
    const sliderY = 45;
    const sliderWidth = 150;
    const sliderHeight = 50;
    const trackY = sliderY + 32;
    const trackWidth = 130;
    const trackX = sliderX + 10;

    ctx.fillStyle = 'rgba(80, 80, 80, 0.8)';
    ctx.fillRect(sliderX, sliderY, sliderWidth, sliderHeight);
    ctx.strokeStyle = fallSliderDragging ? '#FFD700' : '#FFF';
    ctx.lineWidth = fallSliderDragging ? 3 : 1;
    ctx.strokeRect(sliderX, sliderY, sliderWidth, sliderHeight);

    ctx.fillStyle = '#FFF';
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Fall Speed: ' + maxFallSpeed, sliderX + 5, sliderY + 15);

    // Slider track
    ctx.fillStyle = '#333';
    ctx.fillRect(trackX, trackY, trackWidth, 8);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(trackX, trackY, trackWidth, 8);

    // Slider handle
    const handlePos = trackX + ((maxFallSpeed - 1) / 249) * trackWidth;
    ctx.fillStyle = fallSliderDragging ? '#FFD700' : '#FFF';
    ctx.beginPath();
    ctx.arc(handlePos, trackY + 4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Store slider bounds for mouse detection
    window.fallSliderBounds = { x: trackX, y: trackY - 8, width: trackWidth, height: 24 };

    // Game Speed Slider - Same row as fall speed, to the right
    const speedSliderX = canvas.width / 2 + 85;
    const speedSliderY = 45;
    const speedTrackY = speedSliderY + 35;
    const speedTrackX = speedSliderX + 25;
    const speedTrackWidth = 100;

    ctx.fillStyle = 'rgba(80, 80, 80, 0.8)';
    ctx.fillRect(speedSliderX, speedSliderY, 150, 55);
    ctx.strokeStyle = speedSliderDragging ? '#FFD700' : '#FFF';
    ctx.lineWidth = speedSliderDragging ? 3 : 1;
    ctx.strokeRect(speedSliderX, speedSliderY, 150, 55);

    // FPS label at top
    ctx.fillStyle = '#FFF';
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('FPS: ' + gameSpeed, speedSliderX + 10, speedSliderY + 20);

    // Min label (1)
    ctx.fillStyle = '#FFF';
    ctx.font = '12px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('1', speedTrackX - 5, speedTrackY + 6);

    // Slider track
    ctx.fillStyle = '#333';
    ctx.fillRect(speedTrackX, speedTrackY, speedTrackWidth, 8);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(speedTrackX, speedTrackY, speedTrackWidth, 8);

    // Slider handle
    const speedHandlePos = speedTrackX + ((gameSpeed - 1) / 179) * speedTrackWidth;
    ctx.fillStyle = speedSliderDragging ? '#FFD700' : '#FFF';
    ctx.beginPath();
    ctx.arc(speedHandlePos, speedTrackY + 4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Max label (180)
    ctx.fillStyle = '#FFF';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('180', speedTrackX + speedTrackWidth + 5, speedTrackY + 6);

    // Store slider bounds for mouse detection
    window.speedSliderBounds = { x: speedTrackX, y: speedTrackY - 8, width: speedTrackWidth, height: 24 };

    // Gravity Slider - Below fall speed slider
    const gravSliderX = canvas.width / 2 - 75;
    const gravSliderY = 105;
    const gravTrackY = gravSliderY + 35;
    const gravTrackX = gravSliderX + 25;
    const gravTrackWidth = 100;

    ctx.fillStyle = 'rgba(80, 80, 80, 0.8)';
    ctx.fillRect(gravSliderX, gravSliderY, 150, 55);
    ctx.strokeStyle = gravitySliderDragging ? '#FFD700' : '#FFF';
    ctx.lineWidth = gravitySliderDragging ? 3 : 1;
    ctx.strokeRect(gravSliderX, gravSliderY, 150, 55);

    // Gravity label at top
    ctx.fillStyle = '#FFF';
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Gravity: ' + gravity.toFixed(1), gravSliderX + 10, gravSliderY + 20);

    // Min label (0.1)
    ctx.fillStyle = '#FFF';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('0.1', gravTrackX - 3, gravTrackY + 5);

    // Slider track
    ctx.fillStyle = '#333';
    ctx.fillRect(gravTrackX, gravTrackY, gravTrackWidth, 8);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(gravTrackX, gravTrackY, gravTrackWidth, 8);

    // Slider handle (range 0.1 to 3.0)
    const gravHandlePos = gravTrackX + ((gravity - 0.1) / 2.9) * gravTrackWidth;
    ctx.fillStyle = gravitySliderDragging ? '#FFD700' : '#FFF';
    ctx.beginPath();
    ctx.arc(gravHandlePos, gravTrackY + 4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Max label (3.0)
    ctx.fillStyle = '#FFF';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('3.0', gravTrackX + gravTrackWidth + 3, gravTrackY + 5);

    // Store slider bounds for mouse detection
    window.gravitySliderBounds = { x: gravTrackX, y: gravTrackY - 8, width: gravTrackWidth, height: 24 };

    // Initial Fall Speed Slider - Same row as gravity slider, to the right
    const initFallSliderX = canvas.width / 2 + 85;
    const initFallSliderY = 105;
    const initFallTrackY = initFallSliderY + 35;
    const initFallTrackX = initFallSliderX + 25;
    const initFallTrackWidth = 100;

    ctx.fillStyle = 'rgba(80, 80, 80, 0.8)';
    ctx.fillRect(initFallSliderX, initFallSliderY, 150, 55);
    ctx.strokeStyle = initialFallSliderDragging ? '#FFD700' : '#FFF';
    ctx.lineWidth = initialFallSliderDragging ? 3 : 1;
    ctx.strokeRect(initFallSliderX, initFallSliderY, 150, 55);

    // Initial fall label at top
    ctx.fillStyle = '#FFF';
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('Start Fall: ' + initialFallSpeed, initFallSliderX + 10, initFallSliderY + 20);

    // Min label (0)
    ctx.fillStyle = '#FFF';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('0', initFallTrackX - 3, initFallTrackY + 5);

    // Slider track
    ctx.fillStyle = '#333';
    ctx.fillRect(initFallTrackX, initFallTrackY, initFallTrackWidth, 8);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(initFallTrackX, initFallTrackY, initFallTrackWidth, 8);

    // Slider handle (range 0 to 50)
    const initFallHandlePos = initFallTrackX + (initialFallSpeed / 50) * initFallTrackWidth;
    ctx.fillStyle = initialFallSliderDragging ? '#FFD700' : '#FFF';
    ctx.beginPath();
    ctx.arc(initFallHandlePos, initFallTrackY + 4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Max label (50)
    ctx.fillStyle = '#FFF';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('50', initFallTrackX + initFallTrackWidth + 3, initFallTrackY + 5);

    // Store slider bounds for mouse detection
    window.initialFallSliderBounds = { x: initFallTrackX, y: initFallTrackY - 8, width: initFallTrackWidth, height: 24 };

    // Instructions - bottom left
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 165, 150, 45);
    ctx.fillStyle = '#AAA';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('1-4: Select | Shift: Apply', 15, 180);
    ctx.fillText('Esc: Close | Drag sliders', 15, 195);
}

// Draw FPS indicator on bottom left (always visible during gameplay)
function drawFPSIndicator() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(10, canvas.height - 30, 70, 20);
    ctx.fillStyle = '#FFF';
    ctx.font = '12px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('FPS: ' + gameSpeed, 15, canvas.height - 15);
}

function setupGunningMode() {
    // Use same platform setup as Platform Arena
    setupPlatformArena();
    // Reset gunning-specific health
    let baseGunningHealth = 15;
    if (healthMode === 'long') {
        baseGunningHealth = 225;  // 15x health
    } else if (healthMode === 'short') {
        baseGunningHealth = 1;  // 1 hit
    }
    player1.maxGunningHealth = baseGunningHealth;
    player2.maxGunningHealth = baseGunningHealth;
    player1.gunningHealth = baseGunningHealth;
    player2.gunningHealth = baseGunningHealth;
    player1.gunCooldown = 0;
    player2.gunCooldown = 0;
    player1.baseCooldown = 40;
    player2.baseCooldown = 40;
    player1.superGunActive = false;
    player2.superGunActive = false;
    player1.shieldsCollected = 0;
    player2.shieldsCollected = 0;
    player1.superBulletsRemaining = 0;
    player2.superBulletsRemaining = 0;
    player1.superBulletTimer = 0;
    player2.superBulletTimer = 0;
    bullets = [];
}

function drawMenu() {
    drawBackground();
    
    // Title
    ctx.fillStyle = 'white';
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('MULTIPLAYER FIGHTING GAME', canvas.width / 2, 120);
    
    ctx.font = '25px Arial';
    ctx.fillText('Choose Game Mode', canvas.width / 2, 200);
    
    // Draw buttons
    Object.keys(menuButtons).forEach(key => {
        const button = menuButtons[key];
        
        // Button background
        if (button.hovered) {
            ctx.fillStyle = '#FFD700';
        } else {
            ctx.fillStyle = '#555';
        }
        ctx.fillRect(button.x, button.y, button.width, button.height);
        
        // Button border
        ctx.strokeStyle = button.hovered ? '#FFF' : '#999';
        ctx.lineWidth = 3;
        ctx.strokeRect(button.x, button.y, button.width, button.height);
        
        // Button text
        ctx.fillStyle = button.hovered ? '#000' : '#FFF';
        ctx.font = 'bold 25px Arial';
        ctx.fillText(button.text, button.x + button.width/2, button.y + button.height/2 + 8);
    });
    
    // Controls info
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    ctx.fillText('Player 1: WASD + F (attack) + G (powerup)', canvas.width / 2, 450);
    ctx.fillText('Player 2: Arrows + Enter (attack) + \\ (powerup)', canvas.width / 2, 480);

    // Secret toggles
    ctx.fillStyle = '#AAA';
    ctx.font = '14px Arial';
    ctx.fillText('P1 Toggles: R (auto-fire) | E (auto-jump) | Q (no-jump)', canvas.width / 2, 520);
    ctx.fillText('P2 Toggles: / (auto-fire) | \' (auto-jump) | . (no-jump)', canvas.width / 2, 540);

    // Health mode status
    ctx.font = 'bold 20px Arial';
    if (healthMode === 'long') {
        ctx.fillStyle = '#FFD700';
        ctx.fillText('15x HEALTH MODE ACTIVE', canvas.width / 2, 580);
    } else if (healthMode === 'short') {
        ctx.fillStyle = '#FF4444';
        ctx.fillText('1 HP MODE ACTIVE - INSTANT DEATH!', canvas.width / 2, 580);
    } else {
        ctx.fillStyle = '#AAA';
        ctx.fillText('Normal Health Mode', canvas.width / 2, 580);
    }
}

let lastTime = 0;

// Game update function (called multiple times per frame for speed > 60)
function gameUpdate() {
    if (gameState !== 'playing') return;

    currentFrame++;
    player1.update(player2);
    player2.update(player1);

    // Only spawn lootboxes after first input
    if (gameStarted) {
        lootboxTimer++;
        const spawnTime = gameMode === 'gunning' ? LOOTBOX_SPAWN_TIME_GUNNING : LOOTBOX_SPAWN_TIME_NORMAL;
        if (lootboxTimer >= spawnTime) {
            const randomX = Math.random() * (canvas.width - 30);
            const randomPlatform = platforms[Math.floor(Math.random() * platforms.length)];
            const lootboxY = randomPlatform.y - 35;
            lootboxes.push(new Lootbox(randomX, lootboxY));
            lootboxTimer = 0;
        }
    }

    lootboxes = lootboxes.filter(lootbox => !lootbox.collected);
    lootboxes.forEach(lootbox => {
        lootbox.update();
        lootbox.checkCollection(player1);
        lootbox.checkCollection(player2);
    });

    // Handle game mode specific updates
    if (gameMode === 'gunning') {
        // Update and filter bullets
        bullets = bullets.filter(bullet => {
            bullet.update();

            // Check collisions with players
            if (bullet.owner === 'player1' && bullet.checkCollision(player2)) {
                if (player2.shieldsCollected > 0 && player2.gunningHealth >= player2.maxGunningHealth) {
                    player2.shieldsCollected = 0;
                } else {
                    player2.gunningHealth--;
                }

                if (bullet.isSuper) {
                    const target = player2;
                    bullet.x = player1.x + player1.width / 2;
                    bullet.y = player1.y + player1.height / 2;
                    const dx = (target.x + target.width/2) - bullet.x;
                    const dy = (target.y + target.height/2) - bullet.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance > 0) {
                        bullet.velocityX = (dx / distance) * bullet.speed;
                        bullet.velocityY = (dy / distance) * bullet.speed;
                    }
                    return true;
                }
                return false;

            } else if (bullet.owner === 'player2' && bullet.checkCollision(player1)) {
                if (player1.shieldsCollected > 0 && player1.gunningHealth >= player1.maxGunningHealth) {
                    player1.shieldsCollected = 0;
                } else {
                    player1.gunningHealth--;
                }

                if (bullet.isSuper) {
                    const target = player1;
                    bullet.x = player2.x + player2.width / 2;
                    bullet.y = player2.y + player2.height / 2;
                    const dx = (target.x + target.width/2) - bullet.x;
                    const dy = (target.y + target.height/2) - bullet.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance > 0) {
                        bullet.velocityX = (dx / distance) * bullet.speed;
                        bullet.velocityY = (dy / distance) * bullet.speed;
                    }
                    return true;
                }
                return false;
            }

            return bullet.active;
        });

        // Check for gunning mode winner
        if (player1.gunningHealth <= 0) {
            winner = 'Player 2';
            gameState = 'gameOver';
        } else if (player2.gunningHealth <= 0) {
            winner = 'Player 1';
            gameState = 'gameOver';
        }
    } else {
        // Classic, Best of 3, and Platform Arena modes
        checkCollisions();
        checkWinner();
    }
}

function gameLoop(currentTime) {
    // Calculate frame delay based on gameSpeed (capped at 60 for rendering)
    const renderFPS = Math.min(gameSpeed, 60);
    const frameDelay = 1000 / renderFPS;
    const deltaTime = currentTime - lastTime;

    if (deltaTime >= frameDelay) {
        // Calculate how many update ticks to run
        const ticksPerFrame = Math.max(1, Math.round(gameSpeed / 60));

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (gameState === 'menu') {
            drawMenu();
        } else if (gameState === 'playing') {
            // Run multiple update ticks for higher speeds
            for (let i = 0; i < ticksPerFrame; i++) {
                gameUpdate();
            }

            drawBackground();
            platforms.forEach(platform => platform.draw());

            // Draw bullets in gunning mode
            if (gameMode === 'gunning') {
                bullets.forEach(bullet => bullet.draw());
            }

            lootboxes.forEach(lootbox => lootbox.draw());
            player1.draw();
            player2.draw();
            
            // Draw round counter and win indicators only in bestOf3 mode
            if (gameMode === 'bestOf3') {
                ctx.fillStyle = 'white';
                ctx.font = 'bold 20px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(`Round ${player1Wins + player2Wins + 1} | First to ${WINS_NEEDED}`, canvas.width / 2, 30);
                
                // Draw win indicators
                ctx.textAlign = 'left';
                ctx.fillStyle = '#FF6B6B';
                for (let i = 0; i < player1Wins; i++) {
                    ctx.fillRect(10 + i * 25, 10, 20, 20);
                }
                ctx.textAlign = 'right';
                ctx.fillStyle = '#4ECDC4';
                for (let i = 0; i < player2Wins; i++) {
                    ctx.fillRect(canvas.width - 30 - i * 25, 10, 20, 20);
                }
            } else if (gameMode === 'classic') {
                ctx.fillStyle = 'white';
                ctx.font = 'bold 20px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Classic Mode', canvas.width / 2, 30);
            } else if (gameMode === 'platformArena') {
                ctx.fillStyle = 'white';
                ctx.font = 'bold 20px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Platform Arena', canvas.width / 2, 30);
            }
            
            // Draw auto mode indicators
            ctx.font = '14px Arial';
            ctx.textAlign = 'left';

            // Player 1 indicators
            let p1Y = 50;
            if (player1.autoFire) {
                ctx.fillStyle = '#FF0000';
                ctx.fillText('P1: AUTO-FIRE', 10, p1Y);
                p1Y += 20;
            }
            if (player1.autoJump) {
                ctx.fillStyle = '#00FF00';
                ctx.fillText('P1: AUTO-JUMP', 10, p1Y);
                p1Y += 20;
            }
            if (player1.jumpDisabled) {
                ctx.fillStyle = '#FF00FF';
                ctx.fillText('P1: NO JUMP', 10, p1Y);
            }

            // Player 2 indicators
            ctx.textAlign = 'right';
            let p2Y = 50;
            if (player2.autoFire) {
                ctx.fillStyle = '#FF0000';
                ctx.fillText('P2: AUTO-FIRE', canvas.width - 10, p2Y);
                p2Y += 20;
            }
            if (player2.autoJump) {
                ctx.fillStyle = '#00FF00';
                ctx.fillText('P2: AUTO-JUMP', canvas.width - 10, p2Y);
                p2Y += 20;
            }
            if (player2.jumpDisabled) {
                ctx.fillStyle = '#FF00FF';
                ctx.fillText('P2: NO JUMP', canvas.width - 10, p2Y);
            }
        } else if (gameState === 'roundOver') {
            drawBackground();
            platforms.forEach(platform => platform.draw());
            player1.draw();
            player2.draw();
            drawRoundOver();
        } else if (gameState === 'matchOver') {
            drawBackground();
            platforms.forEach(platform => platform.draw());
            player1.draw();
            player2.draw();
            drawMatchOver();
        } else if (gameState === 'gameOver') {
            drawBackground();
            platforms.forEach(platform => platform.draw());
            player1.draw();
            player2.draw();
            drawGameOver();
        }

        // Draw FPS indicator (always visible during gameplay)
        if (gameState !== 'menu') {
            drawFPSIndicator();
        }

        // Draw hidden test panel on top of everything
        drawTestPanel();

        lastTime = currentTime - (deltaTime % frameDelay);
    }
    
    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);